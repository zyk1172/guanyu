import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { slidingWindowCount, slidingWindowRecord, CACHE_KEYS } from '@/lib/cache';

const ANALYZE_WINDOW_MS = 5 * 60 * 1000;
const ANALYZE_WINDOW_LIMIT = 3;
const CAPTCHA_WINDOW_MS = 10 * 60 * 1000;
const CAPTCHA_WINDOW_LIMIT = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_LIMIT = 8;
const EXTENSION_LINK_WINDOW_MS = 10 * 60 * 1000;
const EXTENSION_LINK_WINDOW_LIMIT = 12;
const COMPLETION_WINDOW_MS = 5 * 60 * 1000;
const COMPLETION_WINDOW_LIMIT = 3;
const QA_WINDOW_MS = 5 * 60 * 1000;
const QA_WINDOW_LIMIT = 10;
const FEEDBACK_WINDOW_MS = 30 * 60 * 1000;
const FEEDBACK_WINDOW_LIMIT = 3;
const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_CHANGE_WINDOW_LIMIT = 5;
const URL_PARSE_WINDOW_MS = 5 * 60 * 1000;
const URL_PARSE_WINDOW_LIMIT = 10;
const AUDIT_VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOGIN_SOURCE_WINDOW_LIMIT = 30;

async function acquireUserActionLock(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  key: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export function getClientIp(request: Request) {
  const trustProxyHeaders = process.env.VERCEL === '1' || process.env.TRUST_PROXY_HEADERS === 'true';
  if (!trustProxyHeaders) return 'direct-client';
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export function requireClientIp(request: Request) {
  const ip = getClientIp(request);
  if (ip === 'direct-client' && process.env.NODE_ENV === 'production') {
    throw new Error('服务器未配置可信反向代理，无法安全限流公开请求。');
  }
  return ip;
}

export function hashForStorage(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function assertAnalyzeRateLimit(userId: string) {
  // 优先走 Redis 滑动窗口；Redis 未配置或故障时回退数据库统计
  const redisCount = await slidingWindowCount(CACHE_KEYS.analyzeRateLimit(userId), ANALYZE_WINDOW_MS);
  const recentCount = redisCount !== null
    ? redisCount
    : await prisma.rateLimitEvent.count({
        where: {
          userId,
          action: 'analyze',
          createdAt: { gte: new Date(Date.now() - ANALYZE_WINDOW_MS) },
        },
      });

  if (recentCount >= ANALYZE_WINDOW_LIMIT) {
    throw new Error('操作过于频繁，请 5 分钟后再生成新的审视报告。');
  }
}

export async function recordAnalyzeEvent(userId: string) {
  await slidingWindowRecord(CACHE_KEYS.analyzeRateLimit(userId), ANALYZE_WINDOW_MS);
  // 数据库始终记录，作为 Redis 不可用时的回退依据
  await prisma.rateLimitEvent.create({
    data: {
      userId,
      action: 'analyze',
    },
  });
  // 顺带清理该用户一天前的限流事件，防止表无限增长（命中 userId+action+createdAt 索引）
  await prisma.rateLimitEvent.deleteMany({
    where: {
      userId,
      action: 'analyze',
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  }).catch(() => {});
}

export async function assertEmailCodeSendLimit(email: string, ip: string) {
  const windowStart = new Date(Date.now() - 10 * 60 * 1000);
  const ipHash = hashForStorage(ip);
  const [emailCount, ipCount] = await Promise.all([
    prisma.verificationCode.count({
      where: {
        email,
        purpose: 'register_email',
        createdAt: { gte: windowStart },
      },
    }),
    prisma.verificationCode.count({
      where: {
        ipHash,
        purpose: 'register_email',
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  if (emailCount >= 3) {
    throw new Error('该邮箱验证码发送过于频繁，请稍后再试。');
  }
  if (ipCount >= 5) {
    throw new Error('当前网络请求验证码过于频繁，请稍后再试。');
  }
}

export async function assertCaptchaChallengeLimit(ip: string) {
  const windowStart = new Date(Date.now() - CAPTCHA_WINDOW_MS);
  const ipHash = hashForStorage(ip);
  const count = await prisma.verificationCode.count({
    where: {
      ipHash,
      purpose: 'register_captcha',
      createdAt: { gte: windowStart },
    },
  });
  if (count >= CAPTCHA_WINDOW_LIMIT) {
    throw new Error('验证码刷新过于频繁，请 10 分钟后再试。');
  }
}

function loginAttemptKey(email: string) {
  return `login:${hashForStorage(email.trim().toLowerCase())}`;
}

function loginSourceAttemptKey(ip: string) {
  return `login-source:${hashForStorage(ip)}`;
}

export async function reserveLoginAttempt(email: string, ip?: string) {
  const key = loginAttemptKey(email);
  const sourceKey = ip ? loginSourceAttemptKey(ip) : null;
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS);
  await prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-login:${key}`);
    if (sourceKey) await acquireUserActionLock(tx, `guanyu-login:${sourceKey}`);
    const [recentAttempts, sourceAttempts] = await Promise.all([
      tx.verificationCode.count({
        where: { email: key, purpose: 'login_attempt', createdAt: { gte: windowStart } },
      }),
      sourceKey
        ? tx.verificationCode.count({
            where: { email: sourceKey, purpose: 'login_source_attempt', createdAt: { gte: windowStart } },
          })
        : Promise.resolve(0),
    ]);
    if (recentAttempts >= LOGIN_WINDOW_LIMIT) {
      throw new Error('登录尝试过于频繁，请 15 分钟后再试。');
    }
    if (sourceAttempts >= LOGIN_SOURCE_WINDOW_LIMIT) {
      throw new Error('当前网络登录请求过于频繁，请 15 分钟后再试。');
    }
    await tx.verificationCode.createMany({
      data: [
        {
          email: key,
          codeHash: crypto.randomUUID(),
          purpose: 'login_attempt',
          expiresAt: new Date(Date.now() + LOGIN_WINDOW_MS),
        },
        ...(sourceKey ? [{
          email: sourceKey,
          codeHash: crypto.randomUUID(),
          purpose: 'login_source_attempt',
          expiresAt: new Date(Date.now() + LOGIN_WINDOW_MS),
        }] : []),
      ],
    });
  });
}

export async function clearLoginAttempts(email: string) {
  await prisma.verificationCode.deleteMany({
    where: { email: loginAttemptKey(email), purpose: 'login_attempt' },
  });
}

export async function reserveExtensionLinkAttempt(ip: string, code: string) {
  // A deployment without a trusted proxy cannot expose the TCP peer address
  // through the Fetch Request API. Binding this budget to the one-time code as
  // well prevents arbitrary invalid codes from exhausting every user's link
  // exchange bucket in that configuration.
  const key = `extension-link:${hashForStorage(`${ip}:${code}`)}`;
  const windowStart = new Date(Date.now() - EXTENSION_LINK_WINDOW_MS);
  await prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-extension:${key}`);
    const count = await tx.verificationCode.count({
      where: { email: key, purpose: 'extension_link_attempt', createdAt: { gte: windowStart } },
    });
    if (count >= EXTENSION_LINK_WINDOW_LIMIT) {
      throw new Error('插件连接尝试过于频繁，请 10 分钟后再试。');
    }
    await tx.verificationCode.create({
      data: {
        email: key,
        codeHash: crypto.randomUUID(),
        purpose: 'extension_link_attempt',
        expiresAt: new Date(Date.now() + EXTENSION_LINK_WINDOW_MS),
      },
    });
  });
}

export async function reservePublicUrlParseAttempt(ip: string) {
  const key = `parse-url:${hashForStorage(ip)}`;
  const windowStart = new Date(Date.now() - URL_PARSE_WINDOW_MS);
  await prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-parse-url:${key}`);
    const count = await tx.verificationCode.count({
      where: { email: key, purpose: 'parse_url_attempt', createdAt: { gte: windowStart } },
    });
    if (count >= URL_PARSE_WINDOW_LIMIT) {
      throw new Error('网页解析请求过于频繁，请 5 分钟后再试。');
    }
    await tx.verificationCode.create({
      data: {
        email: key,
        codeHash: crypto.randomUUID(),
        purpose: 'parse_url_attempt',
        expiresAt: new Date(Date.now() + URL_PARSE_WINDOW_MS),
      },
    });
  });
}

export async function reserveAnalyzeJobAdmission(userId: string) {
  const windowStart = new Date(Date.now() - ANALYZE_WINDOW_MS);
  return prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-analyze-job:${userId}`);
    const count = await tx.rateLimitEvent.count({
      where: { userId, action: 'analyze_job', createdAt: { gte: windowStart } },
    });
    if (count >= ANALYZE_WINDOW_LIMIT) {
      throw new Error('操作过于频繁，请 5 分钟后再生成新的审视报告。');
    }
    return tx.rateLimitEvent.create({ data: { userId, action: 'analyze_job' } });
  });
}

export async function releaseAnalyzeJobAdmission(userId: string, eventId?: string) {
  if (!eventId) return;
  await prisma.rateLimitEvent.deleteMany({ where: { id: eventId, userId, action: 'analyze_job' } });
}

export async function reserveAuditViewCount(actor: string, auditId: string) {
  const key = `audit-view:${hashForStorage(`${actor}:${auditId}`)}`;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-audit-view:${key}`);
    const alreadyCounted = await tx.verificationCode.findFirst({
      where: { email: key, purpose: 'audit_view', expiresAt: { gt: now } },
      select: { id: true },
    });
    if (alreadyCounted) return false;
    await tx.verificationCode.create({
      data: {
        email: key,
        codeHash: crypto.randomUUID(),
        purpose: 'audit_view',
        expiresAt: new Date(Date.now() + AUDIT_VIEW_WINDOW_MS),
      },
    });
    return true;
  });
}

export async function reserveCompletionAttempt(userId: string) {
  const windowStart = new Date(Date.now() - COMPLETION_WINDOW_MS);
  await prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-completion:${userId}`);
    const count = await tx.rateLimitEvent.count({
      where: { userId, action: 'completion', createdAt: { gte: windowStart } },
    });
    if (count >= COMPLETION_WINDOW_LIMIT) {
      throw new Error('AI 补全操作过于频繁，请 5 分钟后再试。');
    }
    await tx.rateLimitEvent.create({ data: { userId, action: 'completion' } });
  });
}

export async function reserveQaAttempt(userId: string) {
  const windowStart = new Date(Date.now() - QA_WINDOW_MS);
  await prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-qa:${userId}`);
    const count = await tx.rateLimitEvent.count({
      where: { userId, action: 'qa', createdAt: { gte: windowStart } },
    });
    if (count >= QA_WINDOW_LIMIT) {
      throw new Error('追问操作过于频繁，请 5 分钟后再试。');
    }
    await tx.rateLimitEvent.create({ data: { userId, action: 'qa' } });
  });
}

export async function reserveFeedbackAttempt(userId: string) {
  const windowStart = new Date(Date.now() - FEEDBACK_WINDOW_MS);
  return prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-feedback:${userId}`);
    const count = await tx.rateLimitEvent.count({
      where: { userId, action: 'feedback', createdAt: { gte: windowStart } },
    });
    if (count >= FEEDBACK_WINDOW_LIMIT) {
      throw new Error('反馈提交过于频繁，请 30 分钟后再试。');
    }
    return tx.rateLimitEvent.create({ data: { userId, action: 'feedback' } });
  });
}

export async function reservePasswordChangeAttempt(userId: string) {
  const windowStart = new Date(Date.now() - PASSWORD_CHANGE_WINDOW_MS);
  return prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-password-change:${userId}`);
    const count = await tx.rateLimitEvent.count({
      where: { userId, action: 'password_change', createdAt: { gte: windowStart } },
    });
    if (count >= PASSWORD_CHANGE_WINDOW_LIMIT) {
      throw new Error('密码修改尝试过于频繁，请 15 分钟后再试。');
    }
    return tx.rateLimitEvent.create({ data: { userId, action: 'password_change' } });
  });
}

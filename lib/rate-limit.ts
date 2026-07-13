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

export async function reserveLoginAttempt(email: string) {
  const key = loginAttemptKey(email);
  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MS);
  await prisma.$transaction(async (tx) => {
    await acquireUserActionLock(tx, `guanyu-login:${key}`);
    const recentAttempts = await tx.verificationCode.count({
      where: { email: key, purpose: 'login_attempt', createdAt: { gte: windowStart } },
    });
    if (recentAttempts >= LOGIN_WINDOW_LIMIT) {
      throw new Error('登录尝试过于频繁，请 15 分钟后再试。');
    }
    await tx.verificationCode.create({
      data: {
        email: key,
        codeHash: crypto.randomUUID(),
        purpose: 'login_attempt',
        expiresAt: new Date(Date.now() + LOGIN_WINDOW_MS),
      },
    });
  });
}

export async function clearLoginAttempts(email: string) {
  await prisma.verificationCode.deleteMany({
    where: { email: loginAttemptKey(email), purpose: 'login_attempt' },
  });
}

export async function reserveExtensionLinkAttempt(ip: string) {
  const key = `extension-link:${hashForStorage(ip)}`;
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

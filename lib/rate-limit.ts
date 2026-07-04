import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { slidingWindowCount, slidingWindowRecord, CACHE_KEYS } from '@/lib/cache';

const ANALYZE_WINDOW_MS = 5 * 60 * 1000;
const ANALYZE_WINDOW_LIMIT = 3;

export function getClientIp(request: Request) {
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

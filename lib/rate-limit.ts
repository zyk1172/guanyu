import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}

export function hashForStorage(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function assertAnalyzeRateLimit(userId: string) {
  const windowStart = new Date(Date.now() - 5 * 60 * 1000);
  const recentCount = await prisma.rateLimitEvent.count({
    where: {
      userId,
      action: 'analyze',
      createdAt: { gte: windowStart },
    },
  });

  if (recentCount >= 3) {
    throw new Error('操作过于频繁，请 5 分钟后再生成新的审视报告。');
  }
}

export async function recordAnalyzeEvent(userId: string) {
  await prisma.rateLimitEvent.create({
    data: {
      userId,
      action: 'analyze',
    },
  });
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


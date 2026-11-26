import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { createExtensionLinkCode, hashExtensionSecret } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';
import { sameOriginResponse } from '@/lib/request-security';

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后再生成插件连接码。' }, { status: 401 });
  }

  const code = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-extension-link-code:${user.id}`}))`;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 10 * 60 * 1000);
    const [recentCount, activeCount] = await Promise.all([
      tx.extensionLinkCode.count({ where: { userId: user.id, createdAt: { gte: windowStart } } }),
      tx.extensionLinkCode.count({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } } }),
    ]);
    if (recentCount >= 5 || activeCount >= 3) return null;
    const generated = createExtensionLinkCode();
    await tx.extensionLinkCode.create({
      data: {
        userId: user.id,
        codeHash: hashExtensionSecret(generated.replace(/-/g, '')),
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });
    return generated;
  });
  if (!code) {
    return NextResponse.json({ error: '插件连接码生成过于频繁，请使用现有连接码或 10 分钟后再试。' }, {
      status: 429, headers: { 'Retry-After': '600' },
    });
  }

  return NextResponse.json({
    code,
    expiresInSeconds: 600,
  });
}

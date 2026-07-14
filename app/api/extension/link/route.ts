import { NextResponse } from 'next/server';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { createExtensionToken, hashExtensionSecret, normalizeExtensionCode } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, reserveExtensionLinkAttempt } from '@/lib/rate-limit';

export async function POST(request: Request) {
  await ensureRuntimeSchema();
  const body = await request.json().catch(() => ({}));
  const code = normalizeExtensionCode(String(body.code || ''));
  const browser = String(body.browser || '').trim().slice(0, 80);
  const name = String(body.name || '观隅浏览器助手').trim().slice(0, 80);

  if (!/^[A-F0-9]{32}$/.test(code)) {
    return NextResponse.json({ error: '插件连接码格式无效。' }, { status: 400 });
  }
  try {
    await reserveExtensionLinkAttempt(getClientIp(request), code);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '插件连接尝试过于频繁，请稍后再试。' }, { status: 429 });
  }

  const codeHash = hashExtensionSecret(code);
  const linkCode = await prisma.extensionLinkCode.findUnique({
    where: { codeHash },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!linkCode || linkCode.usedAt || linkCode.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: '插件连接码无效、已使用或已过期。' }, { status: 400 });
  }

  const token = createExtensionToken();
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.extensionLinkCode.updateMany({
        where: { id: linkCode.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error('连接码已被使用或已过期。');
      await tx.extensionSession.create({
        data: {
          userId: linkCode.userId,
          tokenHash: hashExtensionSecret(token),
          name,
          browser,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
    });
  } catch {
    return NextResponse.json({ error: '插件连接码无效、已使用或已过期。' }, { status: 400 });
  }

  return NextResponse.json({
    token,
    user: {
      email: linkCode.user.email,
      name: linkCode.user.name,
    },
  });
}

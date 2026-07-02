import { NextResponse } from 'next/server';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { createExtensionToken, hashExtensionSecret, normalizeExtensionCode } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  await ensureRuntimeSchema();
  const body = await request.json().catch(() => ({}));
  const code = normalizeExtensionCode(String(body.code || ''));
  const browser = String(body.browser || '').trim().slice(0, 80);
  const name = String(body.name || '观隅浏览器助手').trim().slice(0, 80);

  if (!/^\d{4}-?\d{4}$/.test(code)) {
    return NextResponse.json({ error: '插件连接码格式无效。' }, { status: 400 });
  }

  const codeHash = hashExtensionSecret(code.includes('-') ? code : `${code.slice(0, 4)}-${code.slice(4)}`);
  const linkCode = await prisma.extensionLinkCode.findUnique({
    where: { codeHash },
    include: { user: { select: { email: true, name: true } } },
  });

  if (!linkCode || linkCode.usedAt || linkCode.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: '插件连接码无效、已使用或已过期。' }, { status: 400 });
  }

  const token = createExtensionToken();
  await prisma.$transaction([
    prisma.extensionLinkCode.update({
      where: { id: linkCode.id },
      data: { usedAt: new Date() },
    }),
    prisma.extensionSession.create({
      data: {
        userId: linkCode.userId,
        tokenHash: hashExtensionSecret(token),
        name,
        browser,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return NextResponse.json({
    token,
    user: {
      email: linkCode.user.email,
      name: linkCode.user.name,
    },
  });
}

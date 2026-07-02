import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { createExtensionLinkCode, hashExtensionSecret } from '@/lib/extension-auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后再生成插件连接码。' }, { status: 401 });
  }

  const code = createExtensionLinkCode();
  await prisma.extensionLinkCode.create({
    data: {
      userId: user.id,
      codeHash: hashExtensionSecret(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  return NextResponse.json({
    code,
    expiresInSeconds: 600,
  });
}

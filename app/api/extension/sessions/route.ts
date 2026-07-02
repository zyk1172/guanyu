import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后查看插件授权。' }, { status: 401 });
  }

  const sessions = await prisma.extensionSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      browser: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(sessions);
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后撤销插件授权。' }, { status: 401 });
  }

  const { id } = await params;
  const session = await prisma.extensionSession.findUnique({ where: { id } });
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: '插件授权不存在或无权操作。' }, { status: 404 });
  }

  await prisma.extensionSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

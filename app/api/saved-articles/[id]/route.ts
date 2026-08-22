import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sameOriginResponse } from '@/lib/request-security';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  const { id } = await params;
  const deleted = await prisma.savedArticle.deleteMany({
    where: { id, userId: user.id },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: '已保存文章不存在。' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

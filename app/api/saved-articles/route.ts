import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sameOriginResponse } from '@/lib/request-security';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') || '';
  const items = await prisma.savedArticle.findMany({
    where: { userId: user.id, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      source: true,
      url: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ items, nextCursor: items.length === 50 ? items[items.length - 1].id : null });
}

export async function DELETE(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  await prisma.savedArticle.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}

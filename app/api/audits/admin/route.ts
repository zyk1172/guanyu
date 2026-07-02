import { NextResponse } from 'next/server';
import { getSuperAdminStatus } from '@/lib/admin';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 });
    }

    const isSuperAdmin = await getSuperAdminStatus(user.id);
    if (!isSuperAdmin) {
      return NextResponse.json({ error: '你没有权限查看全站审视记录。' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    const audits = await prisma.audit.findMany({
      where: search ? { title: { contains: search } } : {},
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(audits);
  } catch (error) {
    console.error('GET admin audits error:', error);
    return NextResponse.json({ error: '获取全站审视记录失败' }, { status: 500 });
  }
}

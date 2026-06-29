import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 });
    }

    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const mode = searchParams.get('mode') || '';
    const depth = searchParams.get('depth') || '';
    const isPublicParam = searchParams.get('isPublic');

    const whereClause: any = {
      userId,
    };

    if (search) {
      whereClause.title = { contains: search };
    }

    if (mode) {
      whereClause.analysisMode = mode;
    }

    if (depth) {
      whereClause.reasoningDepth = depth;
    }

    if (isPublicParam !== null && isPublicParam !== undefined && isPublicParam !== '') {
      whereClause.isPublic = isPublicParam === 'true';
    }

    const myAudits = await prisma.audit.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(myAudits);
  } catch (error: any) {
    console.error('GET my audits error:', error);
    return NextResponse.json({ error: '获取我的审视记录失败' }, { status: 500 });
  }
}

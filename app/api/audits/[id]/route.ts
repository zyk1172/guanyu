import { NextResponse } from 'next/server';
import { getSuperAdminStatus } from '@/lib/admin';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const userId = user?.id;

    const audit = await prisma.audit.findUnique({
      where: { id },
    });

    if (!audit) {
      return NextResponse.json({ error: '未找到该审视记录' }, { status: 404 });
    }

    // 鉴权逻辑：如果是私有审视且不是创建者本人访问，直接返回 403
    if (!audit.isPublic && audit.userId !== userId) {
      return NextResponse.json({ error: '你没有权限查看这条审视记录。' }, { status: 403 });
    }

    // 每次查看审视详情时，增加热度与浏览次数
    const updatedAudit = await prisma.audit.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        heatScore: { increment: 1 },
      },
    });

    return NextResponse.json(updatedAudit);
  } catch (error: any) {
    console.error('GET audit details error:', error);
    return NextResponse.json({ error: '获取审视详情失败' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 });
    }

    const userId = user.id;
    const audit = await prisma.audit.findUnique({
      where: { id },
    });

    if (!audit) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (audit.userId !== userId) {
      return NextResponse.json({ error: '你没有权限修改他人的审视记录。' }, { status: 403 });
    }

    const body = await request.json();
    const { isPublic } = body;

    const updatedAudit = await prisma.audit.update({
      where: { id },
      data: {
        isPublic: isPublic !== undefined ? isPublic : audit.isPublic,
      },
    });

    return NextResponse.json(updatedAudit);
  } catch (error: any) {
    console.error('PATCH audit error:', error);
    return NextResponse.json({ error: '更新审视公开状态失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 });
    }

    const userId = user.id;
    const audit = await prisma.audit.findUnique({
      where: { id },
    });

    if (!audit) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    const isSuperAdmin = await getSuperAdminStatus(userId);
    if (audit.userId !== userId && !isSuperAdmin) {
      return NextResponse.json({ error: '你没有权限删除他人的审视记录。' }, { status: 403 });
    }

    await prisma.audit.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE audit error:', error);
    return NextResponse.json({ error: '删除记录失败' }, { status: 500 });
  }
}

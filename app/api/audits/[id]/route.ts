import { after, NextResponse } from 'next/server';
import { getSuperAdminStatus } from '@/lib/admin';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cacheDel, cacheDelByPrefix, cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';

type AuditRecord = NonNullable<Awaited<ReturnType<typeof prisma.audit.findUnique>>>;

async function invalidateAuditCaches(id: string) {
  await Promise.all([
    cacheDel(CACHE_KEYS.audit(id)),
    cacheDelByPrefix(CACHE_KEYS.hotAuditsPrefix),
  ]);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const userId = user?.id;
    const isSuperAdmin = userId ? await getSuperAdminStatus(userId) : false;

    // Authorization is always decided from the database. A cached public
    // snapshot must never keep a report readable after its owner makes it private.
    const currentAudit = await prisma.audit.findUnique({ where: { id } });

    if (!currentAudit) {
      return NextResponse.json({ error: '未找到该审视记录' }, { status: 404 });
    }

    // 鉴权逻辑：如果是私有审视且不是创建者本人访问，直接返回 403
    if (!currentAudit.isPublic && currentAudit.userId !== userId && !isSuperAdmin) {
      return NextResponse.json({ error: '你没有权限查看这条审视记录。' }, { status: 403 });
    }

    const cacheKey = CACHE_KEYS.audit(id);
    const audit = await cacheGet<AuditRecord>(cacheKey) || currentAudit;
    if (audit === currentAudit) await cacheSet(cacheKey, currentAudit, CACHE_TTL.audit);

    // 浏览计数在响应后异步入库，不阻塞详情返回
    after(async () => {
      try {
        await prisma.audit.update({
          where: { id },
          data: {
            viewCount: { increment: 1 },
            heatScore: { increment: 1 },
          },
        });
      } catch (error) {
        console.error('Increment audit view count failed:', id, error);
      }
    });

    return NextResponse.json({
      ...audit,
      viewCount: audit.viewCount + 1,
      heatScore: audit.heatScore + 1,
    });
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

    const isSuperAdmin = await getSuperAdminStatus(userId);
    if (audit.userId !== userId && !isSuperAdmin) {
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

    await invalidateAuditCaches(id);
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

    await invalidateAuditCaches(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE audit error:', error);
    return NextResponse.json({ error: '删除记录失败' }, { status: 500 });
  }
}

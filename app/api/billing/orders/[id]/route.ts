import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sameOriginResponse } from '@/lib/request-security';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'cancel') return NextResponse.json({ error: '不支持的操作。' }, { status: 400 });
  const { id } = await context.params;
  if (id.length > 100) return NextResponse.json({ error: '订单不存在。' }, { status: 404 });
  const result: { status: number; error?: string; orderStatus?: string } = await prisma.$transaction(async (tx) => {
    // Serialize with administrator fulfillment/rejection; cancellation cannot
    // report success while an administrator simultaneously grants the order.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-order:${id}`}));`;
    const order = await tx.purchaseOrder.findFirst({ where: { id, userId: user.id } });
    if (!order) return { status: 404, error: '订单不存在。' };
    if (order.status === 'CANCELLED') return { status: 200, orderStatus: 'CANCELLED' };
    if (!['PENDING', 'pending'].includes(order.status)) return { status: 409, error: '订单已进入处理流程，无法取消；已付款请联系管理员核对。' };
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { status: 200, orderStatus: 'CANCELLED' };
  }).catch(() => ({ status: 503, error: '订单处理暂时不可用，请刷新状态后重试。' }));
  return NextResponse.json(result.error ? { error: result.error } : { id, status: result.orderStatus }, { status: result.status });
}

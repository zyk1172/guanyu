import { after, NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPackageDefinition } from '@/lib/billing';
import { notifyAdminsPendingOrder, notifyUserPendingOrder } from '@/lib/email';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { isSupportedPaymentMethod } from '@/lib/payment-core.mjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后购买点数。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const paymentNote = String(body.paymentNote || '').trim().slice(0, 200);
  const paymentMethod = String(body.paymentMethod || 'alipay_qr');
  const clientRequestId = String(body.clientRequestId || '').trim().slice(0, 100);
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      planType: true,
      email: true,
      name: true,
      isBanned: true,
      creditBalance: true,
      creditBalanceCents: true,
    },
  });

  if (account?.isBanned) {
    return NextResponse.json({ error: '账号已被管理员暂停使用，无法创建订单。' }, { status: 403 });
  }

  if (!paymentNote) {
    return NextResponse.json({ error: '请填写付款备注，建议写账号邮箱、付款平台昵称或转账时间。' }, { status: 400 });
  }
  if (!clientRequestId) {
    return NextResponse.json({ error: '缺少订单请求标识，请刷新页面后重试。' }, { status: 400 });
  }

  if (!isSupportedPaymentMethod(paymentMethod)) {
    return NextResponse.json({ error: '不支持的付款方式。' }, { status: 400 });
  }

  let packageDefinition;
  try {
    packageDefinition = getPackageDefinition(String(body.productId || body.packageType || 'STARTER'), paymentMethod as 'alipay_qr' | 'paypal_qr');
  } catch {
    return NextResponse.json({ error: '无效的套餐。' }, { status: 400 });
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-order-create:${user.id}`}))`;
    const existing = await tx.purchaseOrder.findUnique({
      where: { userId_clientRequestId: { userId: user.id, clientRequestId } },
    });
    if (existing) return existing;

    const openStatuses = ['PENDING', 'PAYMENT_SUBMITTED', 'PAID'];
    const [openOrderCount, recentOrderCount] = await Promise.all([
      tx.purchaseOrder.count({
        where: { userId: user.id, status: { in: openStatuses } },
      }),
      tx.purchaseOrder.count({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      }),
    ]);
    if (openOrderCount >= 3) {
      const error = new Error('已有待处理订单，请先等待管理员确认。');
      (error as any).status = 429;
      throw error;
    }
    if (recentOrderCount >= 2) {
      const error = new Error('创建订单过于频繁，请稍后再试。');
      (error as any).status = 429;
      throw error;
    }

    return tx.purchaseOrder.create({
      data: {
        userId: user.id,
        productId: packageDefinition.productId,
        packageType: packageDefinition.packageType,
        packageName: packageDefinition.packageName,
        amountCents: packageDefinition.amountCents,
        currency: packageDefinition.currency,
        points: packageDefinition.points,
        proAccessDays: packageDefinition.proAccessDays,
        paymentMethod,
        paymentProvider: paymentMethod === 'paypal_qr' ? 'paypal' : 'alipay',
        paymentNote,
        clientRequestId,
      },
    });
    });
  } catch (error: any) {
    if (error?.status === 429) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    return NextResponse.json({ error: '创建订单失败，请稍后重试。' }, { status: 500 });
  }

  // The order is durable before responding. Email delivery runs after the
  // response so a slow provider never makes the payment button feel frozen.
  after(async () => {
    const notificationResults = await Promise.allSettled([
      notifyAdminsPendingOrder({
        orderId: order.id,
        userEmail: account?.email,
        userId: user.id,
        packageName: order.packageName,
        amountCents: order.amountCents,
        currency: order.currency,
        points: order.points,
        paymentMethod: order.paymentMethod,
        paymentNote: order.paymentNote,
        userName: account?.name,
        planType: account?.planType,
        creditBalance: account?.creditBalance,
        creditBalanceCents: account?.creditBalanceCents,
        orderCreatedAt: order.createdAt,
      }),
      notifyUserPendingOrder({
        userEmail: account?.email,
        orderId: order.id,
        packageName: order.packageName,
        amountCents: order.amountCents,
        currency: order.currency,
        points: order.points,
        paymentMethod: order.paymentMethod,
        paymentNote: order.paymentNote,
      }),
    ]);
    for (const result of notificationResults) {
      if (result.status === 'rejected') {
        console.error('Notify pending order failed:', result.reason);
      } else if (!result.value.delivered) {
        console.error('Notify pending order unavailable:', result.value.provider);
      }
    }
  });

  return NextResponse.json(order);
}

import { NextRequest, NextResponse } from 'next/server';
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
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      planType: true,
      email: true,
      name: true,
      isBanned: true,
      creditBalance: true,
      creditBalanceCents: true,
      freeQuotaUsed: true,
    },
  });

  if (account?.isBanned) {
    return NextResponse.json({ error: '账号已被管理员暂停使用，无法创建订单。' }, { status: 403 });
  }

  if (!paymentNote) {
    return NextResponse.json({ error: '请填写付款备注，建议写账号邮箱、付款平台昵称或转账时间。' }, { status: 400 });
  }

  if (!isSupportedPaymentMethod(paymentMethod)) {
    return NextResponse.json({ error: '不支持的付款方式。' }, { status: 400 });
  }

  const packageDefinition = getPackageDefinition(String(body.packageType || 'points_30'), paymentMethod);

  if (packageDefinition.packageType === 'byok_lifetime' && account?.planType === 'byok') {
    return NextResponse.json({ error: '你已经是买断账号，无需重复购买。' }, { status: 400 });
  }

  const order = await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      packageType: packageDefinition.packageType,
      packageName: packageDefinition.packageName,
      amountCents: packageDefinition.amountCents,
      currency: packageDefinition.currency,
      points: packageDefinition.points,
      paymentMethod,
      paymentNote,
    },
  });

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
      freeQuotaUsed: account?.freeQuotaUsed,
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

  return NextResponse.json(order);
}

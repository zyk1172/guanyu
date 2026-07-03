import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPackageDefinition } from '@/lib/billing';
import { notifyAdminsPendingOrder } from '@/lib/email';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后购买点数。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const paymentNote = String(body.paymentNote || '').trim().slice(0, 200);
  const packageDefinition = getPackageDefinition(String(body.packageType || 'points_30'));
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { planType: true, email: true, isBanned: true },
  });

  if (account?.isBanned) {
    return NextResponse.json({ error: '账号已被管理员暂停使用，无法创建订单。' }, { status: 403 });
  }

  if (!paymentNote) {
    return NextResponse.json({ error: '请填写付款备注，建议写账号邮箱、支付宝昵称或转账时间。' }, { status: 400 });
  }

  if (packageDefinition.packageType === 'byok_lifetime' && account?.planType === 'byok') {
    return NextResponse.json({ error: '你已经是买断账号，无需重复购买。' }, { status: 400 });
  }

  const order = await prisma.purchaseOrder.create({
    data: {
      userId: user.id,
      packageType: packageDefinition.packageType,
      packageName: packageDefinition.packageName,
      amountCents: packageDefinition.amountCents,
      points: packageDefinition.points,
      paymentNote,
    },
  });

  notifyAdminsPendingOrder({
    orderId: order.id,
    userEmail: account?.email,
    userId: user.id,
    packageName: order.packageName,
    amountCents: order.amountCents,
    points: order.points,
    paymentNote: order.paymentNote,
  }).catch((error) => {
    console.error('Notify pending order failed:', error);
  });

  return NextResponse.json(order);
}

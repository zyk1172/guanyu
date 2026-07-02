import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getPackageDefinition } from '@/lib/billing';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后购买点数。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const paymentNote = String(body.paymentNote || '').trim().slice(0, 200);
  const packageDefinition = getPackageDefinition(String(body.packageType || 'points_30'));

  if (!paymentNote) {
    return NextResponse.json({ error: '请填写付款备注，建议写账号邮箱、支付宝昵称或转账时间。' }, { status: 400 });
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

  return NextResponse.json(order);
}

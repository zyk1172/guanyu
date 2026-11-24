import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getOrCreateAppSetting } from '@/lib/billing';
import { CHECKOUT_HEADERS, CHECKOUT_PENDING, checkoutChannel, checkoutOrderSelect } from '@/lib/checkout';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { getProduct } from '@/lib/product-catalog';
import { sameOriginResponse } from '@/lib/request-security';

const inputSchema = z.object({
  productId: z.enum(['STARTER', 'PRO']),
  paymentMethod: z.enum(['alipay_qr', 'paypal_qr']),
  clientRequestId: z.string().uuid(),
}).strict();

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401, headers: CHECKOUT_HEADERS });
  const orders = await prisma.purchaseOrder.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: checkoutOrderSelect,
  });
  return NextResponse.json({ orders }, { headers: CHECKOUT_HEADERS });
}

export async function POST(request: NextRequest) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请登录后购买点数。' }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '套餐或付款方式无效，请刷新后重试。' }, { status: 400 });
  const { productId, paymentMethod, clientRequestId } = parsed.data;
  await ensureRuntimeSchema();
  const setting = await getOrCreateAppSetting();
  const channel = checkoutChannel(productId, paymentMethod, setting);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-order-create:${user.id}`}))`;
      const existing = await tx.purchaseOrder.findUnique({
        where: { userId_clientRequestId: { userId: user.id, clientRequestId } },
      });
      if (existing) {
        return existing.productId === productId && existing.paymentMethod === paymentMethod
          ? { id: existing.id }
          : { status: 409, error: '订单请求与已保存的套餐不一致，请刷新后重试。' };
      }
      const pending = await tx.purchaseOrder.findFirst({
        where: { userId: user.id, productId, paymentMethod, status: CHECKOUT_PENDING },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (pending) return pending;
      if (!channel) return { status: 503, error: '该付款方式暂不可用，请选择其他方式。' };

      const [openCount, recentCount] = await Promise.all([
        tx.purchaseOrder.count({
          where: { userId: user.id, status: { in: [CHECKOUT_PENDING, 'pending', 'PENDING', 'PAYMENT_SUBMITTED', 'PAID'] } },
        }),
        tx.purchaseOrder.count({
          where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
        }),
      ]);
      if (openCount >= 3) return { status: 429, error: '已有多笔待处理订单，请先在我的订单中处理。' };
      if (recentCount >= 2) return { status: 429, error: '创建订单过于频繁，请稍后重试。' };

      const product = getProduct(productId, paymentMethod);
      return tx.purchaseOrder.create({
        data: {
          productId: product.productId,
          packageType: product.packageType,
          packageName: product.packageName,
          amountCents: product.amountCents,
          currency: product.currency,
          points: product.points,
          proAccessDays: product.proAccessDays,
          // This status becomes reviewable only after the owner supplies a transaction reference.
          status: CHECKOUT_PENDING,
          userId: user.id,
          paymentMethod,
          paymentProvider: paymentMethod === 'paypal_qr' ? 'paypal' : 'alipay',
          clientRequestId,
        },
        select: { id: true },
      });
    });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: CHECKOUT_HEADERS });
    return NextResponse.json({ id: result.id }, { headers: CHECKOUT_HEADERS });
  } catch {
    return NextResponse.json({ error: '创建订单失败，请稍后重试。' }, { status: 503, headers: CHECKOUT_HEADERS });
  }
}

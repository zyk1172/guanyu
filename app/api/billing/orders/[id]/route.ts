import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getOrCreateAppSetting } from '@/lib/billing';
import { CHECKOUT_HEADERS, CHECKOUT_PENDING, checkoutOrderSelect, orderCheckoutChannel } from '@/lib/checkout';
import { notifyAdminsPendingOrder, notifyUserPendingOrder } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { sameOriginResponse } from '@/lib/request-security';

type Context = { params: Promise<{ id: string }> };
const orderAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cancel') }).strict(),
  z.object({ action: z.literal('submitPayment'), reference: z.string().trim().regex(/^[a-z\d-]{8,64}$/i).toUpperCase() }).strict(),
]);

export async function GET(request: NextRequest, { params }: Context) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401, headers: CHECKOUT_HEADERS });
  const { id } = await params;
  const row = id.length <= 100 && await prisma.purchaseOrder.findFirst({
    where: { id, userId: user.id }, select: { ...checkoutOrderSelect, productId: true },
  });
  if (!row) return NextResponse.json({ error: '订单不存在。' }, { status: 404, headers: CHECKOUT_HEADERS });
  const { productId, ...order } = row;
  const channel = order.status === CHECKOUT_PENDING ? orderCheckoutChannel({ ...order, productId }, await getOrCreateAppSetting()) : null;
  return NextResponse.json({
    order,
    channel: channel?.kind === 'hosted' ? channel : channel?.kind === 'qr' ? { kind: 'qr' } : null,
  }, { headers: CHECKOUT_HEADERS });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401, headers: CHECKOUT_HEADERS });
  const body = orderAction.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: '请填写有效的付款流水号，使用 8–64 位字母、数字或连字符。' }, { status: 400, headers: CHECKOUT_HEADERS });
  const { id } = await params;
  if (id.length > 100) return NextResponse.json({ error: '订单不存在。' }, { status: 404, headers: CHECKOUT_HEADERS });
  const action = body.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Use the same lock as administrator fulfillment and rejection.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-order:${id}`}))`;
      const order = await tx.purchaseOrder.findFirst({ where: { id, userId: user.id } });
      if (!order) return { status: 404, error: '订单不存在。' };
      if (action.action === 'cancel') {
        if (order.status === 'CANCELLED') return { status: 200, orderStatus: order.status };
        if (![CHECKOUT_PENDING, 'PENDING', 'pending'].includes(order.status)) return { status: 409, error: '订单已进入处理流程，已付款请联系管理员核对。' };
        await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
        return { status: 200, orderStatus: 'CANCELLED' };
      }
      if (order.status === 'PAYMENT_SUBMITTED' && order.providerTransactionId === action.reference) {
        return { status: 200, orderStatus: order.status };
      }
      if (order.status !== CHECKOUT_PENDING) return { status: 409, error: '订单状态已经变化，请刷新收银台。' };
      const submitted = await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'PAYMENT_SUBMITTED', paymentNote: action.reference, providerTransactionId: action.reference },
      });
      return { status: 200, orderStatus: submitted.status, submitted };
    });
    if (result.submitted) {
      const order = result.submitted;
      const data = { userEmail: user.email, orderId: id, packageName: order.packageName, amountCents: order.amountCents, currency: order.currency, points: order.points, paymentMethod: order.paymentMethod, paymentNote: order.paymentNote };
      after(async () => {
        const deliveries = await Promise.allSettled([
          notifyAdminsPendingOrder({ ...data, userId: user.id, orderCreatedAt: order.createdAt }),
          notifyUserPendingOrder(data),
        ]);
        if (deliveries.some(delivery => delivery.status === 'rejected' || !delivery.value.accepted)) {
          console.error('[checkout] Payment submission notification was unavailable.');
        }
      });
    }
    return NextResponse.json(result.error ? { error: result.error } : { id, status: result.orderStatus }, { status: result.status, headers: CHECKOUT_HEADERS });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: '此流水号已提交，请核对付款记录或联系管理员。' }, { status: 409, headers: CHECKOUT_HEADERS });
    }
    return NextResponse.json({ error: '订单处理暂时不可用，请刷新状态后重试。' }, { status: 503, headers: CHECKOUT_HEADERS });
  }
}

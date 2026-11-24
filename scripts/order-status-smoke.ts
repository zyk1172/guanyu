import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { fulfillOrder } from '../lib/billing';
import { GET, POST } from '../app/api/billing/orders/route';
import { GET as readOrder, PATCH } from '../app/api/billing/orders/[id]/route';
import { GET as readQr } from '../app/api/billing/orders/[id]/qr/route';
import { checkoutChannel } from '../lib/checkout';

async function main() {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { email: `order-owner-${suffix}@example.com`, password: 'unused-smoke-fixture' } });
  const other = await prisma.user.create({ data: { email: `order-other-${suffix}@example.com`, password: 'unused-smoke-fixture' } });
  try {
    const earlier = new Date(Date.now() - 120_000);
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: owner.id, sessionVersion: owner.sessionVersion } });
    const request = (path: string, method = 'GET') => new NextRequest(`http://localhost${path}`, { method, headers: { origin: 'http://localhost', cookie: `next-auth.session-token=${token}`, 'Content-Type': 'application/json' }, ...(method === 'PATCH' ? { body: JSON.stringify({ action: 'cancel' }) } : {}) });
    const order = await prisma.purchaseOrder.create({ data: { userId: owner.id, points: 3, createdAt: earlier, adminNote: 'private fixture note' } });
    const foreign = await prisma.purchaseOrder.create({ data: { userId: other.id } });
    const paid = await prisma.purchaseOrder.create({ data: { userId: owner.id, status: 'PAID', createdAt: earlier } });
    const cancel = (id: string) => PATCH(request(`/api/billing/orders/${id}`, 'PATCH'), { params: Promise.resolve({ id }) });
    const crossSite = request(`/api/billing/orders/${order.id}`, 'PATCH');
    crossSite.headers.set('origin', 'https://unrelated.example');
    assert.equal((await PATCH(crossSite, { params: Promise.resolve({ id: order.id }) })).status, 403);
    assert.equal((await cancel(foreign.id)).status, 404);
    assert.equal((await cancel(paid.id)).status, 409);
    assert.equal((await cancel(order.id)).status, 200);
    assert.equal((await cancel(order.id)).status, 200);
    assert.equal(await prisma.pointTransaction.count({ where: { userId: owner.id } }), 0);
    const list = await GET(request('/api/billing/orders'));
    const json = await list.json();
    assert.ok(json.orders.every((entry: { id: string }) => entry.id !== foreign.id));
    assert.ok(!JSON.stringify(json).includes('adminNote'));
    const raceOrder = await prisma.purchaseOrder.create({ data: { userId: owner.id, points: 3, createdAt: earlier } });
    await Promise.allSettled([cancel(raceOrder.id), fulfillOrder(raceOrder.id)]);
    const final = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: raceOrder.id } });
    const ledger = await prisma.pointTransaction.findMany({ where: { orderId: raceOrder.id } });
    if (final.status === 'CANCELLED') assert.equal(ledger.length, 0);
    else { assert.equal(final.status, 'FULFILLED'); assert.equal(ledger.length, 1); assert.equal(ledger[0].deltaCents, 300); assert.equal((await cancel(raceOrder.id)).status, 409); }
    assert.equal(checkoutChannel('PRO', 'paypal_qr', { paypalProCreditsUrl: 'https://www.paypal.com/ncp/payment/TEST123' })?.kind, 'hosted');
    assert.equal(checkoutChannel('PRO', 'paypal_qr', { paypalProCreditsUrl: 'https://www.paypal.com.example/ncp/payment/TEST123' }), null);
    assert.equal(checkoutChannel('PRO', 'paypal_qr', { paypalProCreditsUrl: 'https://www.paypal.com/redirect?to=https://example.com' }), null);

    const input = { productId: 'PRO', paymentMethod: 'alipay_qr', clientRequestId: crypto.randomUUID() };
    const create = (body: unknown = input) => POST(new NextRequest('http://localhost/api/billing/orders', {
      method: 'POST', headers: request('/api/billing/orders').headers, body: JSON.stringify(body),
    }));
    assert.equal((await create({ ...input, amountCents: 1 })).status, 400);
    const [firstResponse, secondResponse] = await Promise.all([create(), create()]);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    const { id } = await firstResponse.json();
    assert.equal((await secondResponse.json()).id, id);
    const context = { params: Promise.resolve({ id }) };
    const endpoint = `/api/billing/orders/${id}`;
    const orderResponse = await readOrder(request(endpoint), context);
    const checkout = await orderResponse.json();
    assert.equal(checkout.order.amountCents, 5990);
    assert.equal(checkout.order.status, 'CHECKOUT_PENDING');
    assert.deepEqual(checkout.channel, { kind: 'qr' });
    assert.match(orderResponse.headers.get('cache-control')!, /private, no-store/);
    await assert.rejects(fulfillOrder(id));
    const foreignToken = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: other.id, sessionVersion: other.sessionVersion } });
    const foreignRequest = new NextRequest(`http://localhost${endpoint}`, { headers: { cookie: `next-auth.session-token=${foreignToken}` } });
    assert.equal((await readOrder(foreignRequest, context)).status, 404);
    assert.equal((await readQr(foreignRequest, context)).status, 404);
    assert.equal((await readQr(new NextRequest(`http://localhost${endpoint}/qr`), context)).status, 401);
    assert.equal((await readQr(request(`${endpoint}/qr`), context)).headers.get('content-type'), 'image/jpeg');
    assert.equal((await cancel(id)).status, 200);
    assert.equal((await readQr(request(`${endpoint}/qr`), context)).status, 404);
    console.log('Order smoke passed: ownership, safe DTO, pending-only cancellation, idempotency, unchanged ledger, and concurrent fulfillment.');
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

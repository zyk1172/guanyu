import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getCurrentUser } from '@/lib/auth';
import { getOrCreateAppSetting } from '@/lib/billing';
import { CHECKOUT_HEADERS, checkoutOrderSelect, orderCheckoutChannel } from '@/lib/checkout';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return new Response(null, { status: 401, headers: CHECKOUT_HEADERS });
  const { id } = await params;
  const order = id.length <= 100 && await prisma.purchaseOrder.findFirst({
    where: { id, userId: user.id }, select: { ...checkoutOrderSelect, productId: true },
  });
  if (!order) return new Response(null, { status: 404, headers: CHECKOUT_HEADERS });
  const channel = orderCheckoutChannel(order, await getOrCreateAppSetting());
  if (channel?.kind !== 'qr') return new Response(null, { status: 404, headers: CHECKOUT_HEADERS });
  const image = await readFile(join(process.cwd(), 'lib/payment-assets', channel.file)).catch(() => null);
  return image ? new Response(new Uint8Array(image), {
    headers: { ...CHECKOUT_HEADERS, 'Content-Type': 'image/jpeg', 'Cross-Origin-Resource-Policy': 'same-origin' },
  }) : new Response(null, { status: 503, headers: CHECKOUT_HEADERS });
}

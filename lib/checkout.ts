import type { PurchaseOrder } from '@/lib/generated/prisma/client';
import { getPaymentUrl, getProduct, type PaymentMethod, type ProductId } from './product-catalog';

export const CHECKOUT_PENDING = 'CHECKOUT_PENDING';
export const CHECKOUT_HEADERS = { 'Cache-Control': 'private, no-store' };

const qrPaths = { alipay_qr: '/alipay-qr.jpg', paypal_qr: '/paypal-qr.jpg' };

export function checkoutChannel(productId: ProductId, method: PaymentMethod, setting: Record<string, unknown>) {
  const configuredLink = getPaymentUrl(productId, method, setting);
  if (configuredLink) {
    try {
      const url = new URL(configuredLink);
      const trustedTarget = method === 'paypal_qr'
        ? (['www.paypal.com', 'paypal.com'].includes(url.hostname) && /^\/ncp\/payment\/[\w-]+\/?$/.test(url.pathname))
        : url.hostname === 'qr.alipay.com' && /^\/[a-z\d]+\/?$/i.test(url.pathname);
      if (trustedTarget && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && !url.search) {
        return { kind: 'hosted' as const, url: url.href };
      }
    } catch { /* Invalid checkout configuration is unavailable. */ }
    return null;
  }
  const configuredImage = method === 'alipay_qr' ? setting.alipayQrImageUrl : setting.paypalQrImageUrl;
  return !configuredImage || configuredImage === qrPaths[method]
    ? { kind: 'qr' as const, file: qrPaths[method].slice(1) }
    : null;
}

export const checkoutOrderSelect = {
  id: true, packageName: true, amountCents: true, currency: true, points: true, proAccessDays: true, status: true,
  paymentMethod: true, createdAt: true, paidAt: true, fulfilledAt: true, confirmedAt: true,
} as const;

export type CheckoutOrder = Pick<PurchaseOrder, keyof typeof checkoutOrderSelect>;

export function orderCheckoutChannel(order: CheckoutOrder & { productId: string }, setting: Record<string, unknown>) {
  if (order.status !== CHECKOUT_PENDING || (order.productId !== 'STARTER' && order.productId !== 'PRO')
    || (order.paymentMethod !== 'alipay_qr' && order.paymentMethod !== 'paypal_qr')) return null;
  const channel = checkoutChannel(order.productId, order.paymentMethod, setting);
  const product = getProduct(order.productId, order.paymentMethod);
  if (channel?.kind === 'hosted' && (product.amountCents !== order.amountCents || product.currency !== order.currency)) return null;
  return channel;
}

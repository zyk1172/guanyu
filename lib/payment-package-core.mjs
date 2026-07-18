// Kept as a CommonJS-compatible façade for historical imports. The canonical
// catalogue lives in product-catalog.ts and is always evaluated server-side.
export function getPaymentPackageDefinition(packageType, paymentMethod = 'alipay_qr') {
  const productId = String(packageType || '').toUpperCase();
  const pro = productId === 'PRO' || productId === 'PRO_CREDITS' || productId === 'BYOK_LIFETIME';
  const paypal = paymentMethod === 'paypal_qr';
  const amount = pro ? (paypal ? 899 : 5990) : (paypal ? 399 : 2490);
  return {
    productId: pro ? 'PRO' : 'STARTER',
    packageType: pro ? 'pro_credits' : 'starter_credits',
    packageName: pro ? '专业点数包' : '基础点数包',
    amountCents: amount,
    currency: paypal ? 'USD' : 'CNY',
    points: pro ? 80 : 30,
    proAccessDays: pro ? 30 : 0,
  };
}

export type ProductId = 'STARTER' | 'PRO';
export type PaymentMethod = 'alipay_qr' | 'paypal_qr';

export type ProductDefinition = {
  id: ProductId;
  name: { 'zh-CN': string; 'en-US': string };
  prices: Record<'CNY' | 'USD', number>;
  credits: number;
  proAccessDays: number;
  isRecommended?: boolean;
};

// The server is the only authority for price, credits and Pro duration.
// Payment links remain deploy-time configuration, never request parameters.
export const PRODUCT_CATALOG: Record<ProductId, ProductDefinition> = {
  STARTER: {
    id: 'STARTER',
    name: { 'zh-CN': '基础点数包', 'en-US': 'Starter Credits' },
    prices: { CNY: 24.9, USD: 3.99 },
    credits: 30,
    proAccessDays: 0,
  },
  PRO: {
    id: 'PRO',
    name: { 'zh-CN': '专业点数包', 'en-US': 'Pro Credits' },
    prices: { CNY: 59.9, USD: 8.99 },
    credits: 80,
    proAccessDays: 30,
    isRecommended: true,
  },
};

export function getProduct(productId: unknown, paymentMethod: PaymentMethod = 'alipay_qr') {
  const id = String(productId || '').toUpperCase() as ProductId;
  const product = PRODUCT_CATALOG[id];
  if (!product) throw new Error('无效的套餐。');
  const currency = paymentMethod === 'paypal_qr' ? 'USD' as const : 'CNY' as const;
  const amount = product.prices[currency];
  return {
    productId: product.id,
    packageType: product.id === 'PRO' ? 'pro_credits' : 'starter_credits',
    packageName: product.name['zh-CN'],
    amountCents: Math.round(amount * 100),
    currency,
    points: product.credits,
    proAccessDays: product.proAccessDays,
    isRecommended: Boolean(product.isRecommended),
  };
}

export function getPaymentUrl(productId: ProductId, method: PaymentMethod, setting?: Record<string, unknown>) {
  const fromSetting = method === 'paypal_qr'
    ? productId === 'PRO' ? setting?.paypalProCreditsUrl : setting?.paypalStarterCreditsUrl
    : productId === 'PRO' ? setting?.alipayProCreditsUrl : setting?.alipayStarterCreditsUrl;
  const fromEnvironment = method === 'paypal_qr'
    ? productId === 'PRO' ? process.env.PAYPAL_PRO_CREDITS_URL : process.env.PAYPAL_STARTER_CREDITS_URL
    : productId === 'PRO' ? process.env.ALIPAY_PRO_CREDITS_URL : process.env.ALIPAY_STARTER_CREDITS_URL;
  return String(fromSetting || fromEnvironment || '').trim();
}

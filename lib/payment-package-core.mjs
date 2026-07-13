export function getPaymentPackageDefinition(packageType, paymentMethod = 'alipay_qr') {
  const paypal = paymentMethod === 'paypal_qr';

  if (packageType === 'byok_lifetime') {
    return paypal
      ? { packageType: 'byok_lifetime', packageName: '高级功能解锁', amountCents: 500, currency: 'USD', points: 0 }
      : { packageType: 'byok_lifetime', packageName: '30 元高级功能解锁 · 自备 API', amountCents: 3000, currency: 'CNY', points: 0 };
  }

  return paypal
    ? { packageType: 'points_30', packageName: '20 点套餐', amountCents: 100, currency: 'USD', points: 20 }
    : { packageType: 'points_30', packageName: '30 点套餐', amountCents: 600, currency: 'CNY', points: 30 };
}

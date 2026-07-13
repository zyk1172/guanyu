export const MANUAL_PAYMENT_METHODS = ['alipay_qr', 'paypal_qr'];

export function isSupportedPaymentMethod(value) {
  return MANUAL_PAYMENT_METHODS.includes(value);
}

export function getPaymentMethodLabel(method, language = 'zh-CN') {
  const english = language === 'en-US';
  if (method === 'paypal_qr') return english ? 'PayPal QR code' : 'PayPal 收款码';
  return english ? 'Alipay QR code' : '支付宝收款码';
}

export function formatPaymentAmount(amountCents, currency = 'CNY') {
  const amount = (Number(amountCents || 0) / 100).toFixed(2);
  return currency === 'USD' ? `$${amount} USD` : `¥${amount} CNY`;
}

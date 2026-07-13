import { formatPaymentAmount, getPaymentMethodLabel } from './payment-core.mjs';

/**
 * @param {{
 *   orderId: string;
 *   packageName: string;
 *   amountCents: number;
 *   currency?: string;
 *   points: number;
 *   paymentMethod: string;
 *   paymentNote?: string | null;
 * }} input
 */
export function buildPendingPaymentLines({
  orderId,
  packageName,
  amountCents,
  currency = 'CNY',
  points,
  paymentMethod,
  paymentNote = null,
}) {
  return [
    `订单 ID：${orderId}`,
    `套餐：${packageName}`,
    `金额：${formatPaymentAmount(amountCents, currency)}`,
    `点数：${points}`,
    `付款方式：${getPaymentMethodLabel(paymentMethod)}`,
    `付款备注：${paymentNote || '未填写'}`,
  ];
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import { ActionLink, Button, ButtonLink, Input, Panel } from '@/components/ui/controls';
import { formatOrderStatus } from '@/lib/account-display';
import type { CheckoutOrder } from '@/lib/checkout';

type Checkout = {
  order: Omit<CheckoutOrder, 'createdAt' | 'paidAt' | 'fulfilledAt' | 'confirmedAt'>;
  channel: { kind: 'hosted'; url: string } | { kind: 'qr' } | null;
};

export default function SecureCheckout({ id }: { id: string }) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const text = (chinese: string, english: string) => zh ? chinese : english;
  const endpoint = `/api/billing/orders/${encodeURIComponent(id)}`;
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    setShowQr(false);
    setQrFailed(false);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal });
      setUnauthenticated(response.status === 401);
      if (!response.ok) {
        setCheckout(null);
        if (response.status === 401) return;
        if (response.status === 404) {
          setError(zh ? '找不到这笔订单。' : 'This order could not be found.');
          return;
        }
        throw new Error();
      }
      setCheckout(await response.json());
    } catch {
      if (!signal?.aborted) setError(zh ? '暂时无法读取订单，请刷新重试。' : 'Could not load the order. Please try again.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endpoint, zh]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submitPayment', reference }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(zh ? data.error : 'Could not submit payment. Check the reference or refresh the order.');
      setCheckout(current => current && { channel: null, order: { ...current.order, status: data.status } });
      setReference('');
      setShowQr(false);
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : text('付款信息提交失败，请重试。', 'Could not submit payment. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  }

  const order = checkout?.order;
  const channel = checkout?.channel;
  const awaitingPayment = order?.status === 'CHECKOUT_PENDING';
  const provider = order?.paymentMethod === 'paypal_qr' ? 'PayPal' : text('支付宝', 'Alipay');

  return <>
    <Header />
    <main id="main-content" className="workspace-content mx-auto max-w-2xl px-4">
      <Panel className="space-y-6" aria-busy={loading}>
        <h1 className="ui-page-title">{text('安全收银台', 'Secure checkout')}</h1>
        {loading && <p role="status">{text('正在读取订单…', 'Loading your order…')}</p>}
        {unauthenticated && <ButtonLink variant="primary" href="/login">{text('登录', 'Sign in')}</ButtonLink>}
        {unauthenticated && <p>{text('登录后可从账户页的“我的订单”继续付款。', 'After signing in, return through My orders in your account.')}</p>}
        {order && <>
          <dl className="space-y-2">
            <div className="flex flex-wrap justify-between gap-x-3"><dt>{text('套餐', 'Package')}</dt><dd>{order.packageName} · {order.points} {text('点', 'credits')}{order.proAccessDays > 0 && ` · Pro ${order.proAccessDays} ${text('天', 'days')}`}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3"><dt>{text('应付金额', 'Amount due')}</dt><dd className="font-semibold tabular-nums">{new Intl.NumberFormat(language, { style: 'currency', currency: order.currency, currencyDisplay: 'code' }).format(order.amountCents / 100)}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3"><dt>{text('付款方式', 'Payment method')}</dt><dd>{provider}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3"><dt>{text('订单号', 'Order number')}</dt><dd className="break-all tabular-nums">{order.id}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3"><dt>{text('订单状态', 'Status')}</dt><dd role="status" className="font-semibold">{formatOrderStatus(order.status, language)}</dd></div>
          </dl>
          {awaitingPayment && <>
            <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
              <h2 className="ui-panel-title">{text('核对金额并付款', 'Review and pay')}</h2>
              <p className="text-sm text-[var(--color-text-muted)]">{text(`请在${provider}核对实际收款方及金额。付款完成后，回到本页提交付款流水号。`, `Check the recipient and amount in ${provider}. After paying, return here with the transaction reference.`)}</p>
              {channel?.kind === 'hosted' && <ActionLink variant="primary" href={channel.url} target="_blank" rel="noopener noreferrer">{text(`前往${provider}付款`, `Continue to ${provider}`)}</ActionLink>}
              {channel?.kind === 'qr' && <Button variant="primary" onClick={() => { setShowQr(!showQr || qrFailed); setQrFailed(false); }} aria-expanded={showQr && !qrFailed}>{showQr && !qrFailed ? text('收起付款码', 'Hide payment code') : text(`显示${provider}付款码`, `Show ${provider} payment code`)}</Button>}
              {channel?.kind === 'qr' && showQr && !qrFailed &&
                // eslint-disable-next-line @next/next/no-img-element
                <img width={224} height={224} className="h-auto max-w-full" src={`${endpoint}/qr`} alt={text(`${provider}付款码`, `${provider} payment code`)} onError={() => setQrFailed(true)} />}
              {qrFailed && <p role="alert">{text('付款码未能加载，请重试。', 'The payment code could not be loaded. Try again.')}</p>}
              {!channel && <p role="status">{text('此订单的付款入口暂不可用。已付款仍可提交流水号。', 'Payment is unavailable for this order. If you have already paid, you can submit your transaction reference.')}</p>}
            </section>
            <form onSubmit={submitPayment} className="space-y-3 border-t border-[var(--color-border)] pt-4">
              <h2 className="ui-panel-title">{text('提交付款流水号', 'Submit payment reference')}</h2>
              <label className="block"><span className="ui-field-label">{text('付款平台交易号', 'Provider transaction ID')}</span><Input required minLength={8} maxLength={64} pattern="[A-Za-z0-9\\-]{8,64}" autoComplete="off" value={reference} onChange={event => setReference(event.target.value)} /></label>
              <p className="text-sm text-[var(--color-text-muted)]">{text('在付款平台的交易详情中查看。管理员核对收款后，点数和权益才会到账。', 'Find this ID in the provider’s transaction details. Credits and benefits are delivered after manual verification.')}</p>
              <Button type="submit" busy={submitting}>{submitting ? text('正在提交…', 'Submitting…') : text('提交核对', 'Submit for review')}</Button>
            </form>
          </>}
          {order.status === 'PAYMENT_SUBMITTED' && <p className="text-sm text-[var(--color-text-muted)]">{text('流水号已提交。管理员核对收款后可在此查看到账状态。', 'Your reference was submitted. Check here for fulfillment after manual verification.')}</p>}
        </>}
        {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/account" variant="ghost">{text('返回账户与订单', 'Back to account and orders')}</ButtonLink>
          {!unauthenticated && <Button disabled={loading || submitting} onClick={() => void load()}>{text('刷新订单状态', 'Refresh order status')}</Button>}
        </div>
      </Panel>
    </main>
  </>;
}

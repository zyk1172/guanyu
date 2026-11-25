'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import { Button, ButtonLink, Panel } from '@/components/ui/controls';
import { formatOrderStatus } from '@/lib/account-display';
import { useCallback, useEffect, useId, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';

type Order = { id: string; packageName: string; amountCents: number; currency: string; points: number; status: string; createdAt: string; paidAt?: string | null; fulfilledAt?: string | null; confirmedAt?: string | null };

export default function OrderHistory({ refreshKey = '' }: { refreshKey?: string }) {
  const { confirm } = useConfirmation();
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const headingId = useId();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await fetch('/api/billing/orders', { cache: 'no-store' }); if (!response.ok) throw new Error('order history unavailable'); const data = await response.json(); setOrders(data.orders || []); }
    catch { setError(zh ? '订单暂时无法加载，请重试。' : 'Orders could not be loaded. Please retry.'); }
    finally { setLoading(false); }
  }, [zh]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const cancel = async (id: string) => {
    if (!await confirm(zh ? '取消订单申请不会自动退回已转账款项。已付款请联系管理员核对退款。继续取消？' : 'Cancelling the request does not refund transferred funds. Contact the administrator if already paid. Cancel the request?')) return;
    setBusy(id); setError('');
    try { const response = await fetch(`/api/billing/orders/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Cancellation failed'); }
    finally { setBusy(''); }
  };
  return <Panel className="col-span-full min-w-0" aria-labelledby={headingId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={headingId} className="ui-panel-title">{zh ? '我的订单' : 'My orders'}</h2>
      <Button variant="ghost" disabled={loading || !!busy} onClick={() => void load()}>
        {loading ? (zh ? '加载中…' : 'Loading…') : (zh ? '刷新状态' : 'Refresh status')}
      </Button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
    {!loading && !orders.length && !error && <p className="mt-3 text-sm">{zh ? '暂无订单。' : 'No orders yet.'}</p>}
    {orders.length > 0 && <div className="account-order-scroll mt-3" role="region" tabIndex={0} aria-label={zh ? '订单列表' : 'Order list'} aria-busy={loading}>
      <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {orders.map(order => <li key={order.id} className="grid gap-3 py-3 pe-3 text-sm md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <strong>{order.packageName} · {order.points} {zh ? '点' : 'credits'}</strong>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{zh ? '订单号' : 'Order ID'} {order.id}</p>
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{formatOrderStatus(order.status, language)}</p>
            <p className="mt-1 tabular-nums">{order.currency} {(order.amountCents / 100).toFixed(2)}</p>
          </div>
          <div className="min-w-0 text-xs text-[var(--color-text-muted)] md:text-end">
            <p>{zh ? '下单时间' : 'Ordered at'} <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString(language)}</time></p>
            {(order.fulfilledAt || order.confirmedAt) && ['FULFILLED', 'confirmed'].includes(order.status) &&
              <p className="mt-1">
                {zh ? '到账时间' : 'Fulfilled at'} <time dateTime={order.fulfilledAt || order.confirmedAt!}>{new Date(order.fulfilledAt || order.confirmedAt!).toLocaleString(language)}</time>
              </p>}
            <div className="flex flex-wrap items-start gap-2 empty:hidden md:justify-end [&:not(:empty)]:mt-2">
              {['CHECKOUT_PENDING', 'PAYMENT_SUBMITTED'].includes(order.status) && <ButtonLink href={`/checkout/${encodeURIComponent(order.id)}`}>
                {order.status === 'CHECKOUT_PENDING' ? (zh ? '继续付款' : 'Continue checkout') : (zh ? '查看订单' : 'View order')}
              </ButtonLink>}
              {['CHECKOUT_PENDING', 'PENDING', 'pending'].includes(order.status) && <Button disabled={!!busy} onClick={() => void cancel(order.id)}>
                {busy === order.id ? (zh ? '处理中…' : 'Processing…') : (zh ? '取消订单' : 'Cancel order')}
              </Button>}
            </div>
          </div>
        </li>)}
      </ul>
    </div>}
  </Panel>;
}

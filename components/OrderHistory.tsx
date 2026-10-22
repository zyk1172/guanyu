'use client';
import { useCallback, useEffect, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';
import { formatOrderStatus } from '@/lib/account-display';

type Order = { id: string; packageName: string; amountCents: number; currency: string; points: number; status: string; createdAt: string; paidAt?: string | null; fulfilledAt?: string | null; confirmedAt?: string | null };

export default function OrderHistory({ refreshKey = '' }: { refreshKey?: string }) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
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
    if (!window.confirm(zh ? '取消订单申请不会自动退回已转账款项。已付款请联系管理员核对退款。继续取消？' : 'Cancelling the request does not refund transferred funds. Contact the administrator if already paid. Cancel the request?')) return;
    setBusy(id); setError('');
    try { const response = await fetch(`/api/billing/orders/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Cancellation failed'); }
    finally { setBusy(''); }
  };
  return <section aria-label={zh ? '我的订单' : 'My orders'} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{zh ? '我的订单' : 'My orders'}</h3><button type="button" disabled={loading || !!busy} onClick={() => void load()} className="text-xs font-bold text-[var(--color-primary)]">{loading ? (zh ? '加载中…' : 'Loading…') : (zh ? '刷新状态' : 'Refresh status')}</button></div>
    <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{zh ? '扫码转账需要人工核对。以“点数已到账”和到账时间为准；取消申请不会自动退款。' : 'QR transfers require manual review. Credits are available after fulfillment. Cancelling a request does not automatically refund payment.'}</p>
    {error && <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
    {!loading && !orders.length && !error && <p className="mt-3 text-xs">{zh ? '暂无订单。' : 'No orders yet.'}</p>}
    <div className="mt-3 space-y-3">{orders.map((order) => <article key={order.id} className="rounded-lg border border-[var(--color-border)] p-3 text-xs">
      <div className="flex flex-wrap justify-between gap-2"><strong>{order.packageName} · {order.points} {zh ? '点' : 'credits'}</strong><span>{formatOrderStatus(order.status, language)}</span></div>
      <p className="mt-2 break-all text-[var(--color-text-muted)]">{zh ? '订单' : 'Order'}: {order.id} · {order.currency} {(order.amountCents / 100).toFixed(2)}</p>
      <p className="mt-1 text-[var(--color-text-muted)]">{new Date(order.createdAt).toLocaleString(language)}</p>
      {(order.fulfilledAt || order.confirmedAt) && ['FULFILLED', 'confirmed'].includes(order.status) && <p className="mt-1 font-bold">{zh ? '到账时间' : 'Fulfilled at'}: {new Date(order.fulfilledAt || order.confirmedAt!).toLocaleString(language)}</p>}
      {['PENDING', 'pending'].includes(order.status) && <button type="button" disabled={!!busy} onClick={() => void cancel(order.id)} className="mt-2 rounded border border-[var(--color-border)] px-3 py-1 font-bold">{busy === order.id ? (zh ? '处理中…' : 'Processing…') : (zh ? '取消待确认申请' : 'Cancel pending request')}</button>}
    </article>)}</div>
  </section>;
}

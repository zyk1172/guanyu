'use client';
import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useUiLanguage } from '@/components/LanguageProvider';

type Counts = { pv: number; uv: number; guestPv: number; memberPv: number };
type Traffic = { timezone: string; days: number; today: Counts; summary: Counts; trend: Array<Counts & { date: string }>; pages: Array<{ path: string; pv: number; uv: number }>; firstRecordedAt: string | null };
export default function TrafficAdmin() {
  const { language } = useUiLanguage();
  const text = (zh: string, en: string) => language.startsWith('zh') ? zh : en;
  const [days, setDays] = useState(7);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Traffic | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/traffic?days=${days}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('load');
      return response.json();
    }).then(value => { setData(value); setError(false); setLoading(false); }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => controller.abort();
  }, [days, refresh]);
  const labels: Record<string, string> = { '/': text('首页', 'Home'), '/demo': text('示例报告', 'Sample report'), '/login': text('登录', 'Sign in'), '/register': text('注册入口', 'Registration'), '/audits': text('公开报告', 'Public reports'), '/audits/:id': text('报告详情', 'Report detail'), '/my-audits': text('我的审视', 'My reports'), '/saved-articles': text('收藏文章', 'Saved articles'), '/forgot-password': text('找回密码', 'Password recovery') };
  const max = Math.max(1, ...(data?.trend.map(item => item.pv) || []));
  return <section className="col-span-full min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[var(--shadow-card)]" aria-label={text('访问统计', 'Site traffic')} aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h3 className="flex items-center gap-2 text-base font-bold"><BarChart3 size={20} className="text-[var(--color-primary)]" aria-hidden="true" />{text('访问统计', 'Site traffic')}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{text('了解有多少人来到观隅，以及他们查看了哪些页面。', 'See how many people visit Guanyu and which pages they view.')}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30].map(value => <button key={value} type="button" aria-pressed={days === value} disabled={loading} className={`workspace-button ${days === value ? 'workspace-primary' : 'workspace-secondary'}`} onClick={() => { setLoading(true); setDays(value); }}>{text(`近 ${value} 天`, `Last ${value} days`)}</button>)}
        <button type="button" disabled={loading} className="workspace-button workspace-secondary" aria-label={text('刷新访问统计', 'Refresh traffic')} onClick={() => { setLoading(true); setRefresh(refresh + 1); }}><RefreshCw size={16} aria-hidden="true" /></button>
      </div>
    </div>
    {error ? <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">{text('统计加载失败，请点击刷新重试。', 'Could not load traffic. Refresh to retry.')}</p> : loading ? <p role="status" className="py-8 text-sm text-[var(--color-text-muted)]">{text('正在加载访问统计…', 'Loading traffic…')}</p> : data && <>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        [text('今日浏览量 PV', 'Page views today'), data.today.pv], [text('今日访客 UV', 'Visitors today'), data.today.uv], [text(`近 ${days} 天浏览量`, `Page views · ${days} days`), data.summary.pv], [text(`近 ${days} 天独立访客`, `Unique visitors · ${days} days`), data.summary.uv],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-[var(--color-border)] p-4"><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{Number(value).toLocaleString(language)}</p></div>)}</div>
      {!data.summary.pv && <p className="mt-4 rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm">{text('所选时段还没有访问记录。统计会在上线并收到真实页面访问后开始积累。', 'No visits in this period. Data starts accumulating after deployment and real page visits.')}</p>}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{text('每日访问趋势', 'Daily traffic')}</h4>
          <div className="mt-3 flex gap-4 text-xs text-[var(--color-text-muted)]"><span><i className="mr-1 inline-block h-2 w-2 bg-[var(--color-primary)]" />PV</span><span><i className="mr-1 inline-block h-2 w-2 bg-[var(--color-text-subtle)]" />UV</span></div>
          <div className="mt-3 flex h-44 items-end gap-1 border-b border-[var(--color-border)]" role="img" aria-label={text(`近 ${days} 天每日浏览量与独立访客趋势。具体数据见下方表格。`, `Daily page views and unique visitors for ${days} days. Data is available in the table below.`)}>{data.trend.map(item => <div key={item.date} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${item.date} · PV ${item.pv} · UV ${item.uv}`}><span className="min-w-0 flex-1 rounded-t-sm bg-[var(--color-primary)]" style={{ height: `${item.pv / max * 100}%` }} /><span className="min-w-0 flex-1 rounded-t-sm bg-[var(--color-text-subtle)]" style={{ height: `${item.uv / max * 100}%` }} /></div>)}</div>
          <div className="mt-2 flex justify-between text-xs text-[var(--color-text-muted)]"><span>{data.trend[0].date.slice(5)}</span><span>{data.trend.at(-1)?.date.slice(5)}</span></div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">{text('未登录访客浏览', 'Guest page views')} {data.summary.guestPv.toLocaleString(language)} · {text('已登录用户浏览', 'Signed-in page views')} {data.summary.memberPv.toLocaleString(language)}</p>
          <details className="mt-3 text-xs"><summary className="cursor-pointer text-[var(--color-link)]">{text('查看每日数据', 'View daily data')}</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-2">{text('日期', 'Date')}</th><th>PV</th><th>UV</th><th>{text('未登录 PV', 'Guest PV')}</th></tr></thead><tbody>{data.trend.map(row => <tr key={row.date} className="border-t border-[var(--color-border)]"><td className="py-2">{row.date}</td><td>{row.pv}</td><td>{row.uv}</td><td>{row.guestPv}</td></tr>)}</tbody></table></div></details>
        </div>
        <div className="min-w-0"><h4 className="text-sm font-semibold">{text('热门页面', 'Popular pages')}</h4><table className="mt-3 w-full text-left text-xs"><thead className="text-[var(--color-text-muted)]"><tr><th className="py-2 font-medium">{text('页面', 'Page')}</th><th className="text-right font-medium">PV</th><th className="text-right font-medium">UV</th></tr></thead><tbody>{data.pages.map(row => <tr key={row.path} className="border-t border-[var(--color-border)]"><td className="py-3">{labels[row.path] || row.path}</td><td className="text-right tabular-nums">{row.pv}</td><td className="text-right tabular-nums">{row.uv}</td></tr>)}</tbody></table></div>
      </div>
      <p className="mt-5 border-t border-[var(--color-border)] pt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">{text('统计口径：北京时间；PV 为页面加载或站内页面切换次数，刷新会增加；UV 按浏览器匿名标识去重，不等于实际人数。过滤常见爬虫，排除管理页面；尊重“请勿追踪”与 GPC，使用拦截工具的访问可能不计入。保留最近 90 天，不记录原始 IP、完整网址或个人资料。', 'Timezone: Asia/Shanghai. PV counts page loads and route changes, including reloads. UV deduplicates an anonymous browser ID, not individual people. Common bots and account/admin pages are excluded. DNT and GPC are respected; blockers may prevent counting. Data is retained for 90 days, without raw IPs, full URLs or profile details.')}</p>
    </>}
  </section>;
}

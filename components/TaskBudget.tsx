'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useUiLanguage } from './LanguageProvider';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { formatCreditCents } from '@/lib/platform-model-core.mjs';

type Quote = { source: string; prices: Array<{ operation: string; costCents: number | null; modelName: string; available: boolean }>; exportCostCents: number; balanceCents: number | null };
const COPY = {
  'zh-CN': ['本次任务与后续费用', '分析', 'AI 补全', '每次追问', '每次导出', '点', '暂不可用', '费用确认中…', '费用暂无法确认，请检查模型设置后重试。', '当前点数不足，可先查看示例或购买点数。', '分析成功保存后计费；失败不扣分析点数。追问、补全和导出单独计费，失败时退回预扣点数。', '自定义 API 的模型费用由服务商收取；导出仍使用平台点数。', '查看示例', '模型与点数设置'],
  'zh-TW': ['本次任務與後續費用', '分析', 'AI 補全', '每次追問', '每次匯出', '點', '暫不可用', '費用確認中…', '費用暫無法確認，請檢查模型設定後重試。', '目前點數不足，可先查看示例或購買點數。', '分析成功儲存後計費；失敗不扣分析點數。追問、補全和匯出單獨計費，失敗時退回預扣點數。', '自訂 API 的模型費用由服務商收取；匯出仍使用平台點數。', '查看示例', '模型與點數設定'],
  'en-US': ['Task and follow-up costs', 'Analysis', 'AI completion', 'Each question', 'Each export', 'credits', 'Unavailable', 'Confirming costs…', 'Costs unavailable. Check model settings and retry.', 'Insufficient credits. View the example or purchase credits.', 'Analysis is charged after a report is saved. Failed analysis is not charged. Questions, completions and exports are charged separately; reserved credits are refunded on failure.', 'Your API provider charges model usage separately. Exports still use platform credits.', 'View example', 'Model and credit settings'],
};

export default function TaskBudget({ compact = false, onAvailabilityChange }: { compact?: boolean; onAvailabilityChange?: (ready: boolean) => void }) {
  const { language, t } = useUiLanguage();
  const { status } = useSession();
  const w = getWorkspaceCopy(language);
  const c = COPY[language as keyof typeof COPY] || COPY['en-US'];
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false); setQuote(null);
    fetch('/api/billing/quote', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('quote unavailable'); return response.json(); })
      .then((data) => { if (!controller.signal.aborted) setQuote(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status]);
  const analysis = quote?.prices.find((price) => price.operation === 'analysis');
  useEffect(() => {
    onAvailabilityChange?.(Boolean(!loading && !failed && analysis?.available && analysis.costCents !== null && (quote?.balanceCents === null || (quote?.balanceCents ?? 0) >= analysis.costCents)));
  }, [loading, failed, analysis, quote?.balanceCents, onAvailabilityChange]);
  const price = (operation: string) => {
    const item = quote?.prices.find((entry) => entry.operation === operation);
    return item?.costCents !== null && item?.costCents !== undefined ? `${formatCreditCents(item.costCents)} ${c[5]}${item.available ? '' : ` · ${c[6]}`}` : c[6];
  };
  const details = <div aria-label={c[0]} className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-3 text-xs">
    {!compact && <h3 className="font-bold">{c[0]}</h3>}
    {loading ? <p className="mt-2" role="status">{c[7]}</p> : failed ? <p className="mt-2" role="alert">{c[8]}</p> : quote && <>
      <dl className="mt-2 grid grid-cols-2 gap-2">{[['analysis', c[1]], ['completion', c[2]], ['followup', c[3]]].map(([operation, label]) => <div key={operation}><dt className="text-[var(--color-text-muted)]">{label}</dt><dd className="mt-0.5 font-bold">{price(operation)}</dd></div>)}<div><dt className="text-[var(--color-text-muted)]">{c[4]}</dt><dd className="mt-0.5 font-bold">{formatCreditCents(quote.exportCostCents)} {c[5]}</dd></div></dl>
      {quote.balanceCents !== null && analysis?.costCents !== null && analysis?.costCents !== undefined && quote.balanceCents < analysis.costCents && <p role="status" className="mt-2 font-bold text-[var(--color-warning)]">{c[9]}</p>}
      <p className="mt-2 leading-relaxed text-[var(--color-text-muted)]">{c[10]}</p>
      <p className="mt-1 text-[var(--color-text-muted)]">{language.startsWith('zh-') ? '费用按当前模型设置预估，开始任务时会重新确认。' : 'Prices reflect current model settings and are checked again when a task starts.'}</p>
      {quote.source === 'custom' && <p className="mt-2 text-[var(--color-text-muted)]">{c[11]}</p>}
    </>}
    <div className="mt-3 flex flex-wrap gap-3"><Link href="/demo" className="font-bold text-[var(--color-primary)] underline">{c[12]}</Link><Link href="/account" className="text-[var(--color-primary)] underline">{c[13]}</Link></div>
  </div>;
  if (!compact) return details;
  return <section className="border-t border-[var(--color-border)] pt-3" aria-label={c[0]}>
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{w.analysisCost} <strong>{loading ? c[7] : failed ? c[6] : price('analysis')}</strong></span>
        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{w.costs} <ChevronDown size={14} aria-hidden="true" className="inline" /></span>
      </summary>
      {details}
    </details>
    {quote?.balanceCents !== null && quote?.balanceCents !== undefined && <p className="mb-2 text-xs text-[var(--color-text-muted)]">{t('billing.remainingCredits', undefined, { credits: formatCreditCents(quote.balanceCents) })}</p>}
    {quote?.source === 'custom' && <p className="mb-2 text-xs text-[var(--color-text-muted)]">{c[11]}</p>}
    {!loading && failed && <p className="text-xs text-[var(--color-danger)]" role="alert">{c[8]}</p>}
    {quote?.balanceCents !== null && quote?.balanceCents !== undefined && analysis?.costCents !== null && analysis?.costCents !== undefined && quote.balanceCents < analysis.costCents && <p className="text-xs text-[var(--color-warning)]" role="status">{c[9]}</p>}
  </section>;
}

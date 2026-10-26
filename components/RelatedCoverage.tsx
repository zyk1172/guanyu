'use client';

import ReportText from './ReportText';
import { useCallback, useEffect, useState } from 'react';
import { Search, ChevronDown, ExternalLink } from 'lucide-react';
import { useUiLanguage } from './LanguageProvider';
import { useActiveModel } from './useActiveModel';
import { relatedCoverageCopy } from '@/lib/related-coverage-copy';
import type { CoverageResult, CoverageSynthesis } from '@/lib/related-coverage';

type Job = { status: string; jobId?: string; stage?: string; query?: string; sourceFingerprint?: string; defaultQuery?: string; errorCode?: string; result?: CoverageResult; previous?: CoverageResult; cached?: boolean };
type Finding = NonNullable<CoverageSynthesis['summary']>;

export default function RelatedCoverage({ auditId }: { auditId: string }) {
  const { language, t } = useUiLanguage();
  const c = relatedCoverageCopy(language);
  const model = useActiveModel('followup');
  const [job, setJob] = useState<Job>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const endpoint = `/api/audits/${encodeURIComponent(auditId)}/related-coverage`;
  const receive = useCallback((data: Job) => {
    setJob(data);
    if (data.sourceFingerprint) setFingerprint(data.sourceFingerprint);
    if (data.result || data.previous) setResult(data.result || data.previous!);
    if (data.status === 'completed') setExpanded(false);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      if (!controller.signal.aborted) { receive(data); setQuery(data.query || data.defaultQuery || ''); }
    }).catch(e => { if (!controller.signal.aborted) { setJob({ status: 'idle' }); setError(e.message); } });
    return () => controller.abort();
  }, [endpoint, receive]);
  useEffect(() => {
    if (job.status !== 'running' || !job.jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`${endpoint}?jobId=${encodeURIComponent(job.jobId!)}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            if (!controller.signal.aborted) { setJob({ status: 'idle' }); setError(data.code || 'coverage_not_found'); }
            return;
          }
          throw new Error(data.code);
        }
        if (!controller.signal.aborted) { setError(''); receive(data); if (data.status === 'running') timer = setTimeout(poll, 2000); }
      } catch (e) {
        if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'coverage_failed'); timer = setTimeout(poll, 5000); }
      }
    };
    timer = setTimeout(poll, 500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, job.status, job.jobId, receive]);
  const busy = submitting || job.status === 'running';
  const message = (code: string) => c[code as keyof typeof c] || c.failed;
  const start = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, sourceFingerprint: fingerprint, expectedCostCents: model.estimatedCostCents }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code);
      receive(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'coverage_failed'); }
    finally { setSubmitting(false); }
  };
  const renderFinding = (finding: Finding, key: string | number) => <div key={key} className="mt-3">
    <p className="text-sm leading-relaxed"><ReportText>{finding.text}</ReportText></p>
    <details className="mt-2 text-sm"><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-medium text-[var(--color-link)]"><ChevronDown size={15} aria-hidden="true" />{c.references}</summary>
      <div className="space-y-3 border-l-2 border-[var(--color-border)] pl-4">{finding.citations.map((cite, i) => {
        const article = result?.articles.find(article => article.number === cite.article);
        return <div key={i}><p className="text-xs font-semibold">{article ? <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline">[{cite.article}] {article.title}</a> : c.original}</p><blockquote className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">{cite.quote}</blockquote></div>;
      })}</div>
    </details>
  </div>;
  return <section id="report-related" data-reading-section={c.title} className="workspace-panel" aria-labelledby="related-coverage-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="related-coverage-title">{c.title}</h2><p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{c.intro}</p></div>
      {!expanded && !busy && <button type="button" className="workspace-button workspace-secondary" onClick={() => setExpanded(true)}><Search size={16} aria-hidden="true" />{result ? c.adjust : c.open}</button>}
    </div>
    {job.status === 'loading' && <p role="status" className="mt-3 text-sm text-[var(--color-text-muted)]">{c.loading}</p>}
    {(expanded || busy) && <form onSubmit={start} className="mt-5 space-y-3">
      <label htmlFor="related-coverage-query" className="workspace-label">{c.query}</label>
      <input id="related-coverage-query" className="workspace-input" value={query} minLength={2} maxLength={200} onChange={event => setQuery(event.target.value)} disabled={busy} required />
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{c.fees}</p>
      {model.source === 'custom' && <p className="text-xs text-[var(--color-text-muted)]">{c.custom}</p>}
      {model.error && <p role="alert" className="text-sm text-[var(--color-danger)]">{model.error}</p>}
      <button type="submit" disabled={busy || model.loading || !!model.error || !fingerprint || query.trim().length < 2} className="workspace-button workspace-primary disabled:opacity-60">{busy ? (job.stage === 'compare' ? c.compare : c.search) : `${c.start} · ${model.estimatedCost} ${c.credits}`}</button>
    </form>}
    {busy && <p role="status" className="mt-3 text-sm text-[var(--color-text-muted)]">{c.wait}</p>}
    {(error || job.status === 'failed') && <p role="alert" className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-warning)]">{message(error || job.errorCode || '')}{!fingerprint && <button type="button" onClick={() => window.location.reload()} className="ml-3 underline">{t('common.retry')}</button>}</p>}
    {job.cached && <p role="status" className="mt-3 text-sm text-[var(--color-success)]">{c.reused}</p>}
    {result && <div className="mt-5 border-t border-[var(--color-border)] pt-5">
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{c.saved} · {new Date(result.generatedAt).toLocaleString(language, { timeZoneName: 'short' })} · {result.usage.model} · {result.usage.cost} {c.credits}</p>
      <p className="mt-2 break-words text-xs text-[var(--color-text-muted)]">{c.query}: {result.query}</p>
      <h3 className="mt-5 text-lg font-bold">{c.summary}</h3>{result.synthesis.summary && renderFinding(result.synthesis.summary, 'summary')}
      {([['sharedClaims', c.shared], ['differences', c.differences], ['missingEvidence', c.missing]] as const).filter(([key]) => result.synthesis[key].length > 0).map(([key, label]) => <div key={key} className="mt-5"><h3 className="text-base font-bold">{label}</h3>{result.synthesis[key].map(renderFinding)}</div>)}
      <div className="mt-6 border-t border-[var(--color-border)] pt-5"><h3 className="text-base font-bold">{c.sources}</h3><ol className="mt-3 space-y-4">{result.articles.map(article => <li key={article.number} id={`coverage-source-${article.number}`}><a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 break-words text-sm font-semibold text-[var(--color-link)] underline"><span>[{article.number}] {article.title}</span><ExternalLink size={15} className="mt-1 shrink-0" aria-hidden="true" /></a><p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{new URL(article.url).hostname} · <ReportText>{result.synthesis.matches.find(match => match.article === article.number)?.reason}</ReportText></p></li>)}</ol></div>
      {(result.unreadableCount > 0 || result.excludedCount > 0) && <p className="mt-4 text-xs text-[var(--color-text-muted)]">{c.counts}</p>}
      <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">{c.caution}</p>
    </div>}
    {(expanded || result || busy) && <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">{c.privacy}</p>}
  </section>;
}

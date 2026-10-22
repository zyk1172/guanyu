'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Header from './Header';
import LanguageSwitcher from './LanguageSwitcher';
import TaskBudget from './TaskBudget';
import { useUiLanguage } from './LanguageProvider';
import { formatVerificationStatus } from '@/lib/report-display-core.mjs';
import type { ComparisonReport, ComparisonSynthesis } from '@/lib/report-comparison';
import { reportIdFromReference } from '@/lib/report-reference';

type Candidate = { id: string; title: string; source: string };
type Usage = { cost: string; model: string };

export default function ComparisonWorkbench() {
  const { status } = useSession();
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const [reports, setReports] = useState<ComparisonReport[]>([]);
  const [materialFingerprint, setMaterialFingerprint] = useState('');
  const [focus, setFocus] = useState('');
  const [synthesis, setSynthesis] = useState<ComparisonSynthesis | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (status !== 'authenticated') return;
    const controller = new AbortController();
    fetch('/api/audits/compare?candidates=1', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error('unavailable'); return response.json(); })
      .then((data) => { if (!controller.signal.aborted) setCandidates(data.reports || []); })
      .catch(() => { if (!controller.signal.aborted) setError(zh ? '报告列表加载失败，可使用报告链接添加材料。' : 'The list could not be loaded. Add material using a report link.'); });
    return () => controller.abort();
  }, [status, zh]);
  const choose = (ids: string[]) => { setSelected(ids); setReports([]); setSynthesis(null); setUsage(null); setError(''); };
  const load = async () => {
    setBusy(true); setError(''); setSynthesis(null); setUsage(null); setReports([]);
    try {
      const response = await fetch(`/api/audits/compare?${new URLSearchParams(selected.map((id) => ['id', id])).toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReports(data.reports);
      setMaterialFingerprint(data.materialFingerprint);
    } catch (e) { setError(e instanceof Error ? e.message : 'Comparison unavailable'); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/audits/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: reports.map((report) => report.id), focus, language, materialFingerprint }) });
      const data = await response.json();
      if (response.status === 202) { setError(zh ? '综合正在生成，稍后点击“生成／查看综合”读取结果；相同版本不会重复扣点。' : 'The synthesis is processing. Click again shortly to retrieve it; the same version is not charged twice.'); return; }
      if (response.status === 409) { setReports([]); setSynthesis(null); setUsage(null); }
      if (!response.ok) throw new Error(data.error);
      setSynthesis(data.synthesis); setUsage(data.usage); setCached(Boolean(data.cached));
    } catch (e) { setError(e instanceof Error ? e.message : 'Synthesis unavailable'); }
    finally { setBusy(false); }
  };
  const add = () => {
    const id = reportIdFromReference(reference, window.location.origin);
    if (!id || selected.includes(id) || selected.length >= 3) { setError(zh ? '请输入本站报告链接或编号；最多选择 3 份不同报告。' : 'Enter a report link from this site or an ID; choose up to three distinct reports.'); return; }
    choose([...selected, id]); setReference('');
  };
  const citation = (refs: number[]) => refs.map((number) => <Link key={number} href={`/audits/${encodeURIComponent(reports[number - 1].id)}`} target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-[var(--color-primary)] underline">[{number}]</Link>);
  return <main className="workspace-page min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]"><Header /><div className="mx-auto max-w-6xl space-y-4 px-3 py-5 sm:px-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-black">{zh ? '多报道对比' : 'Compare reports'}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">{zh ? '选择同一议题的 2–3 份报告，对照主张、证据和缺口。重复主张不代表已经证实，也不意味着来源相互独立。对照已有材料不扣点；AI 综合按追问费用单独计费。' : 'Choose 2–3 reports on the same issue to compare claims, evidence and gaps. Repeated claims are not proof or independent corroboration. Inspecting saved material is free; AI synthesis is charged at the follow-up rate.'}</p></div><fieldset disabled={busy}><LanguageSwitcher /></fieldset></div>
    {status !== 'authenticated' ? <section className="rounded-xl border border-[var(--color-border)] p-4">{status === 'loading' ? (zh ? '加载中…' : 'Loading…') : <Link href="/login" className="font-bold text-[var(--color-primary)] underline">{zh ? '登录后选择自己的报告或公开报告' : 'Sign in to select your reports or public reports'}</Link>}</section> : <>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><h2 className="text-sm font-bold">{zh ? '选择材料（最近 50 份）' : 'Select material (50 most recent)'}</h2>
        <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{candidates.map((candidate) => <label key={candidate.id} className="flex min-w-0 items-start gap-2 rounded-lg bg-[var(--color-surface-muted)] p-3 text-xs"><input type="checkbox" aria-label={candidate.title} checked={selected.includes(candidate.id)} disabled={busy || (!selected.includes(candidate.id) && selected.length >= 3)} onChange={(e) => choose(e.target.checked ? [...selected, candidate.id] : selected.filter((id) => id !== candidate.id))} /><span className="min-w-0 break-words"><strong>{candidate.title}</strong><span className="mt-1 block text-[var(--color-text-muted)]">{candidate.source}</span></span></label>)}</div>
        <label className="mt-4 block text-xs font-bold" htmlFor="comparison-reference">{zh ? '添加本站报告链接或编号' : 'Add a report link from this site or an ID'}</label><div className="mt-2 flex gap-2"><input id="comparison-reference" maxLength={2048} value={reference} disabled={busy} onChange={(e) => setReference(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm" /><button type="button" disabled={busy || selected.length >= 3} onClick={add} className="rounded-lg border border-[var(--color-border)] px-3 text-xs font-bold">{zh ? '添加' : 'Add'}</button></div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span>{zh ? `已选 ${selected.length}/3` : `Selected ${selected.length}/3`}</span>{selected.map((id) => <button key={id} type="button" disabled={busy} onClick={() => choose(selected.filter((item) => item !== id))} className="max-w-full break-all rounded border border-[var(--color-border)] px-2 py-1">{candidates.find((item) => item.id === id)?.title || id} ×</button>)}</div>
        <button type="button" disabled={busy || selected.length < 2} onClick={() => void load()} className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? (zh ? '处理中…' : 'Processing…') : (zh ? '打开对照' : 'Open comparison')}</button>
      </section>
      {error && <p role="alert" className="rounded-lg border border-[var(--color-warning)] p-3 text-sm">{error}</p>}
      {!!reports.length && <>
        <section aria-label={zh ? '报告对照' : 'Report comparison'} className="grid gap-3 lg:grid-cols-3">{reports.map((report, index) => <article key={report.id} className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm"><h2 className="font-bold"><Link href={`/audits/${encodeURIComponent(report.id)}`} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">[{index + 1}] {report.title}</Link></h2><p className="mt-2 text-xs text-[var(--color-text-muted)]">{report.source} · {report.publishedAt || (zh ? '发布时间未知' : 'Publication time unknown')} · v{report.reportVersion}</p>
          <h3 className="mt-4 font-bold">{zh ? '报告结论' : 'Report conclusion'}</h3><p className="mt-2 leading-relaxed">{report.conclusion || '—'}</p>
          <h3 className="mt-4 font-bold">{zh ? '报道主张' : 'Article claims'}</h3><ul className="mt-2 list-disc space-y-2 pl-4">{report.claims.map((claim, i) => <li key={i}>{claim}</li>)}</ul>
          <h3 className="mt-4 font-bold">{zh ? '证据与核验状态' : 'Evidence and verification'}</h3>{report.findings.map((finding, i) => <div key={i} className="mt-2 rounded-lg bg-[var(--color-surface-muted)] p-3"><strong>{finding.title}</strong><p className="mt-1 text-xs">{formatVerificationStatus(finding.status || 'pending_verification', language)}</p><p className="mt-2 leading-relaxed">{finding.content}</p>{finding.originalQuote && <blockquote className="mt-2 border-l-2 border-[var(--color-border-strong)] pl-2">{finding.originalQuote}</blockquote>}{finding.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-xs text-[var(--color-primary)] underline">{url}</a>)}</div>)}
          <h3 className="mt-4 font-bold">{zh ? '信息缺口' : 'Information gaps'}</h3><ul className="mt-2 list-disc space-y-2 pl-4">{report.gaps.map((gap, i) => <li key={i}><strong>{gap.title}</strong> {gap.content}</li>)}</ul>
          <h3 className="mt-4 font-bold">{zh ? '核验路径' : 'Next checks'}</h3><ul className="mt-2 list-disc space-y-2 pl-4">{report.nextChecks.map((check, i) => <li key={i}>{check}</li>)}</ul>
        </article>)}</section>
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><h2 className="text-base font-bold">{zh ? 'AI 综合' : 'AI synthesis'}</h2><p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{zh ? '依据已选报告的快照生成。同一组报告版本、语言和核查重点会复用已有结果，不重复计费。新的综合失败会退回预扣点数。原始报告保留其语言。' : 'Generated from the selected report snapshots. The same versions, language and focus reuse a saved result without another charge. Failed new syntheses refund reserved credits. Original reports retain their language.'}</p>
          <div className="mt-3"><TaskBudget /></div><label htmlFor="comparison-focus" className="mt-3 block text-xs font-bold">{zh ? '核查重点（可选，最多 800 字）' : 'Focus (optional, up to 800 characters)'}</label><textarea id="comparison-focus" disabled={busy} maxLength={800} value={focus} onChange={(e) => { setFocus(e.target.value); setSynthesis(null); setUsage(null); }} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-3 text-sm" />
          <button type="button" disabled={busy} onClick={() => void generate()} className="mt-3 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? (zh ? '生成中…' : 'Generating…') : (zh ? '生成／查看综合 · 按追问费用' : 'Generate / retrieve · follow-up rate')}</button>
        </section>
        {synthesis && <section aria-label={zh ? '综合结果' : 'Synthesis result'} className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4"><h2 className="text-lg font-bold">{zh ? '综合结果' : 'Synthesis result'}</h2><p className="mt-2 text-xs text-[var(--color-text-muted)]">{usage?.model} · {cached ? (zh ? '已保存结果，本次未扣点' : 'Saved result; no new charge') : `${usage?.cost} ${zh ? '点' : 'credits'}`}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{synthesis.summary.text}{citation(synthesis.summary.reportRefs)}</p>
          {([['sharedClaims', zh ? '相同主张（未必已证实）' : 'Shared claims (not necessarily verified)'], ['differences', zh ? '不同主张或覆盖差异' : 'Differences in claims or coverage'], ['gaps', zh ? '仍缺哪些证据' : 'Missing evidence'], ['nextChecks', zh ? '下一步核实' : 'Next checks']] as const).map(([key, label]) => <div key={key} className="mt-4"><h3 className="text-sm font-bold">{label}</h3>{synthesis[key].length ? <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">{synthesis[key].map((item, i) => <li key={i}>{item.text}{citation(item.reportRefs)}</li>)}</ul> : <p className="mt-2 text-xs text-[var(--color-text-muted)]">{zh ? '当前材料未形成可支持的判断。' : 'No supported finding from the supplied material.'}</p>}</div>)}
        </section>}
      </>}
    </>}
  </div></main>;
}

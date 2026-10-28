'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Search, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useUiLanguage } from './LanguageProvider';
import RssNewsPanel from './RssNewsPanel';
import { normalizeReportLanguage } from '@/lib/types';
import { NEWS_SEARCH_DRAFT_KEY, decodeNewsSearchDraft, encodeNewsSearchDraft } from '@/lib/news-search-core';
import type { NewsSearchDraft } from '@/lib/news-search-core';
import type { NewsArticle, NewsCapabilities, NewsPeriod, NewsProvider, NewsSearchResult } from '@/lib/news-search-types';

export default function NewsSearch({ onSelect, busy }: { onSelect: (article: NewsArticle) => void; busy: boolean }) {
  const { language } = useUiLanguage();
  const { status } = useSession();
  const text = (zh: string, en: string) => language.startsWith('zh') ? zh : en;
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<NewsProvider>('free');
  const [period, setPeriod] = useState<NewsPeriod>('any');
  const [capabilities, setCapabilities] = useState<NewsCapabilities | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [result, setResult] = useState<NewsSearchResult | null>(null);
  const [resultQuery, setResultQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [rssOpen, setRssOpen] = useState(false);
  const [configRetry, setConfigRetry] = useState(0);
  const restored = useRef<NewsSearchDraft | null>(null);
  const initialized = useRef(false);
  const changed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const resultsPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const draft = decodeNewsSearchDraft(sessionStorage.getItem(NEWS_SEARCH_DRAFT_KEY));
      sessionStorage.removeItem('guanyu-news-search-v1');
      if (draft) { restored.current = draft; setQuery(draft.query); setProvider(draft.provider); setPeriod(draft.period); setResult(draft.result); setResultQuery(draft.query); changed.current = true; }
      else sessionStorage.removeItem(NEWS_SEARCH_DRAFT_KEY);
    } catch { /* Browsing still works when storage is unavailable. */ }
    initialized.current = true;
    return () => { controller.current?.abort(); };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !restored.current?.pending) return;
    const pending = restored.current.pending;
    restored.current = { ...restored.current, pending: null };
    try { sessionStorage.setItem(NEWS_SEARCH_DRAFT_KEY, encodeNewsSearchDraft(restored.current)); } catch {}
    onSelect(pending);
  }, [status, onSelect]);

  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/news/search', { signal: abort.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('config');
      return response.json();
    }).then((data: NewsCapabilities) => {
      setCapabilities(data); setConfigFailed(false);
      if (initialized.current && !changed.current) setProvider(data.defaultProvider);
      if (!data.deepseekAvailable) setProvider('free');
    }).catch(() => { if (!abort.signal.aborted) setConfigFailed(true); });
    return () => abort.abort();
  }, [status, configRetry]);

  function persist(draft: NewsSearchDraft) {
    try { sessionStorage.setItem(NEWS_SEARCH_DRAFT_KEY, encodeNewsSearchDraft(draft)); return true; }
    catch { return false; }
  }

  async function search(useProvider = provider) {
    const value = query.trim();
    if (Array.from(value).length < 2 || Array.from(value).length > 128) { setError(text('请输入 2 至 128 个字符的关键词。', 'Enter 2–128 characters to search.')); input.current?.focus(); return; }
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const current = ++requestNumber.current;
    const requestedPeriod = useProvider === 'deepseek' ? 'any' : period;
    setSearching(true); setError(''); setResult(null); setProvider(useProvider);
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 8; attempt++) {
        response = await fetch('/api/news/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: value, provider: useProvider, period: requestedPeriod, language: normalizeReportLanguage(language) }), signal: abort.signal });
        if (response.status !== 409) break;
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
          const timer = setTimeout(() => { abort.signal.removeEventListener('abort', onAbort); resolve(); }, 2000);
          abort.signal.addEventListener('abort', onAbort, { once: true });
        });
      }
      const data = await response!.json();
      if (!response!.ok) throw new Error(language.startsWith('zh') ? data.error : 'News search is unavailable. Retry, use free news search, or paste an article.');
      if (current !== requestNumber.current) return;
      setResult(data); setResultQuery(value);
      requestAnimationFrame(() => { if (innerWidth < 640 && resultsPanel.current?.getClientRects().length) resultsPanel.current.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); });
      persist({ query: value, provider: useProvider, period: requestedPeriod, result: data, pending: null });
    } catch (error) { if (!abort.signal.aborted && current === requestNumber.current) setError((error as Error).message || text('搜索失败，请重试。', 'Search failed. Please retry.')); }
    finally { if (current === requestNumber.current) setSearching(false); }
  }

  function choose(article: NewsArticle) {
    const saved = persist({ query: resultQuery || query || article.title.slice(0, 128), provider, period, result, pending: status === 'authenticated' ? null : article });
    if (!saved && status !== 'authenticated') { setError(text('浏览器无法保存选择，请先登录后再选择报道。', 'Your browser could not save this selection. Sign in before choosing an article.')); return; }
    onSelect(article);
  }
  const actualSource = result?.providers.map(name => ({ bing: 'Bing News', searxng: 'SearXNG', duckduckgo: 'DuckDuckGo', deepseek: 'DeepSeek API' }[name] || name)).join(' / ');

  return <div className="space-y-5">
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="space-y-3" role="search" aria-label={text('搜索新闻', 'Search news')}>
      <label htmlFor="news-query" className="workspace-label">{text('你想了解什么新闻？', 'What news would you like to understand?')}</label>
      <div className="flex flex-col gap-2 sm:flex-row"><input ref={input} id="news-query" type="search" autoComplete="off" maxLength={256} value={query} onChange={event => setQuery(event.target.value)} placeholder={text('输入事件、人物或关键词，例如：新能源汽车出口', 'Search an event, person or topic, e.g. renewable energy')} className="workspace-input min-w-0 flex-1" /><button type="submit" disabled={configFailed || !capabilities || status === 'loading'} className="workspace-button workspace-primary shrink-0">{searching ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}{searching ? text('重新搜索', 'Search again') : text('搜索新闻', 'Search news')}</button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <label className="text-xs font-semibold">{text('搜索来源', 'Search source')}<select aria-label={text('搜索来源', 'Search source')} className="workspace-input mt-1" value={provider} disabled={!capabilities} onChange={event => { changed.current = true; setProvider(event.target.value as NewsProvider); if (event.target.value === 'deepseek') setPeriod('any'); }}><option value="free">{text('免费新闻搜索', 'Free news search')}</option><option value="deepseek" disabled={!capabilities?.deepseekAvailable}>DeepSeek API{!capabilities?.deepseekAvailable ? text('（未开放）', ' (unavailable)') : capabilities.deepseekSource === 'personal' ? text('（个人密钥）', ' (your key)') : text('（平台提供）', ' (platform)')}</option></select></label>
        <label className="text-xs font-semibold">{text('报道时间', 'Time range')}<select aria-label={text('报道时间', 'Time range')} className="workspace-input mt-1" value={period} disabled={provider === 'deepseek'} onChange={event => setPeriod(event.target.value as NewsPeriod)}>{[['any', text('不限时间', 'Any time')], ['day', text('近一天', 'Past day')], ['week', text('近一周', 'Past week')], ['month', text('近一月', 'Past month')]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{provider === 'free' ? text('搜索不扣分析点数。选择报道后获取正文，再确认费用。', 'Searching uses no analysis credits. Choose a report to read it and review the analysis cost.') : capabilities?.deepseekSource === 'personal' ? text('使用你的 DeepSeek 密钥，仅展示新闻索引中确认的报道，结果可能较少；搜索费用由服务商收取。暂不支持时间筛选。', 'Uses your DeepSeek key. Only matches confirmed by a news index are shown, so results may be limited. Provider fees apply; time filtering is unavailable.') : text('使用平台 DeepSeek API，仅展示新闻索引中确认的报道，结果可能较少；受平台每日限额约束。', 'Uses the platform DeepSeek API. Only matches confirmed by a news index are shown, so results may be limited; daily limits apply.')}</p>
      {status === 'unauthenticated' && <p className="text-xs text-[var(--color-text-muted)]">{text('无需登录即可搜索。生成分析时登录，关键词和所选报道会为你保留。', 'Search without an account. Sign in when you want analysis; your search and selection will be restored.')}</p>}
    </form>
    {configFailed && <p role="alert" className="text-sm text-[var(--color-danger)]">{text('搜索设置加载失败。', 'Search settings could not be loaded.')} <button type="button" className="underline" onClick={() => setConfigRetry(configRetry + 1)}>{text('重试', 'Retry')}</button></p>}
    {searching && <p role="status" className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />{text('正在查找相关报道…', 'Finding related news…')}</p>}
    {error && <div role="alert" className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm"><p>{error}</p>{provider === 'deepseek' && <button type="button" className="workspace-button workspace-secondary" onClick={() => { changed.current = true; void search('free'); }}>{text('改用免费新闻搜索', 'Use free news search')}</button>}</div>}
    {result && <section ref={resultsPanel} className="scroll-mt-24" aria-label={text('新闻搜索结果', 'News search results')}>
      <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3 text-sm"><h3 className="font-semibold">{text(`“${resultQuery}”的搜索结果`, `Results for “${resultQuery}”`)} · {result.articles.length}</h3><p className="text-xs text-[var(--color-text-muted)]">{actualSource || text('未返回结果', 'No results')}{result.cached ? text(' · 缓存结果', ' · Cached') : ''}</p></div>
      {!result.articles.length && <p className="py-8 text-sm text-[var(--color-text-muted)]">{text('没有找到匹配报道。试试更具体的事件、人物，或放宽时间范围。', 'No matching reports. Try a more specific event or person, or broaden the time range.')}</p>}
      <ol className="divide-y divide-[var(--color-border)]">{result.articles.map(article => <li key={article.url} className="grid min-w-0 gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0"><p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]"><span>{article.source}</span>{article.publishedAt ? <time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString(language)}</time> : <span>{text('发布时间未知', 'Publication date unknown')}</span>}</p><h4 className="mt-2 text-base font-semibold leading-relaxed"><a href={article.url} target="_blank" rel="noopener noreferrer" className="break-words hover:text-[var(--color-link)]">{article.title}</a></h4>{article.snippet && <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-[var(--color-text-muted)]">{article.snippet}</p>}</div>
        <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:justify-center"><button type="button" disabled={busy || status === 'loading'} className="workspace-button workspace-secondary" aria-label={text(`分析这篇：${article.title}`, `Analyze article: ${article.title}`)} onClick={() => choose(article)}>{text('分析这篇', 'Analyze article')}</button><a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs text-[var(--color-link)]">{text('查看原文', 'Open original')}<ArrowUpRight size={14} aria-hidden="true" /></a></div>
      </li>)}</ol>
    </section>}
    <details className="workspace-disclosure" open={rssOpen} onToggle={event => setRssOpen(event.currentTarget.open)}><summary>{text('从 RSS 订阅源选一篇', 'Browse RSS subscriptions')}</summary>{rssOpen && <RssNewsPanel isAnalyzing={busy} onAnalyzeHeadline={headline => { setRssOpen(false); choose({ title: headline.title, source: headline.sourceName || new URL(headline.url).hostname, url: headline.url, snippet: '', publishedAt: null, provider: 'rss' }); }} />}</details>
  </div>;
}

'use client';

import { Button, ButtonLink, Input, Panel, Textarea } from '@/components/ui/controls';
import Dialog from '@/components/ui/Dialog';
import { ANALYSIS_DRAFT_KEY, decodeAnalysisDraft, encodeAnalysisDraft } from '@/lib/analysis-draft';
import type { NewsArticle } from '@/lib/news-search-types';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { AnalysisMode, ReportLanguage, normalizeReportLanguage } from '../lib/types';
import { useUiLanguage } from './LanguageProvider';
import NewsSearch from './NewsSearch';
import TaskBudget from './TaskBudget';

interface AnalysisFormProps {
  onSubmit: (data: {
    title: string;
    source: string;
    content: string;
    focus: string;
    mode: AnalysisMode;
    reportLanguage: ReportLanguage;
    sourceUrl?: string;
  }) => void;
  isLoading: boolean;
  articleUrl?: { url: string; selectedAt: number };
}

type ParseFailure = { code: string; message: string };

function explainParseFailure(code: string) {
  switch (code) {
    case 'INVALID_INPUT':
    case 'INVALID_URL':
      return { reasonKey: 'parse.invalidUrlReason', explanationKey: 'parse.invalidUrlExplanation' };
    case 'URL_PRIVATE_ADDRESS':
      return { reasonKey: 'parse.securityReason', explanationKey: 'parse.securityExplanation' };
    case 'RATE_LIMITED':
    case 'UPSTREAM_FORBIDDEN':
      return { reasonKey: 'parse.accessReason', explanationKey: 'parse.accessExplanation' };
    case 'UPSTREAM_NOT_FOUND':
      return { reasonKey: 'parse.notFoundReason', explanationKey: 'parse.notFoundExplanation' };
    case 'UPSTREAM_TIMEOUT':
      return { reasonKey: 'parse.timeoutReason', explanationKey: 'parse.timeoutExplanation' };
    case 'NETWORK_ERROR':
      return { reasonKey: 'parse.networkReason', explanationKey: 'parse.networkExplanation' };
    case 'UPSTREAM_ERROR':
      return { reasonKey: 'parse.serverReason', explanationKey: 'parse.serverExplanation' };
    case 'ARTICLE_EXTRACTION_FAILED':
      return { reasonKey: 'parse.noContentReason', explanationKey: 'parse.noContentExplanation' };
    default:
      return { reasonKey: 'parse.genericReason', explanationKey: 'parse.genericExplanation' };
  }
}

export default function AnalysisForm({ onSubmit, isLoading, articleUrl }: AnalysisFormProps) {
  const { status } = useSession();
  const router = useRouter();
  const { language, t } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text');
  const [draftNotice, setDraftNotice] = useState<'restored' | 'storageError' | null>(null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [focus, setFocus] = useState('');
  const reportLanguage = normalizeReportLanguage(language);
  const mode: AnalysisMode = 'deep';
  const [urlInput, setUrlInput] = useState('');
  const [parsedSourceUrl, setParsedSourceUrl] = useState('');
  const [selectedNews, setSelectedNews] = useState<NewsArticle | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseFailure, setParseFailure] = useState<ParseFailure | null>(null);
  const [parseTrigger, setParseTrigger] = useState<HTMLElement | null>(null);
  const [canAnalyze, setCanAnalyze] = useState(false);
  const parseController = useRef<AbortController | null>(null);
  const parseNumber = useRef(0);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      const draft = decodeAnalysisDraft(window.sessionStorage.getItem(ANALYSIS_DRAFT_KEY));
      if (draft) {
        setTitle(draft.title); setSource(draft.source); setContent(draft.content); setFocus(draft.focus);
        setUrlInput(draft.urlInput); setParsedSourceUrl(draft.parsedSourceUrl); setInputMode(draft.inputMode);
        setDraftNotice('restored');
      }
      window.sessionStorage.removeItem(ANALYSIS_DRAFT_KEY);
    } catch { /* Storage restrictions must not prevent manual entry. */ }
  }, []);

  useEffect(() => {
    if (!articleUrl) return;
    setUrlInput(articleUrl.url); setInputMode('url'); setSelectedNews(null); setParseFailure(null);
  }, [articleUrl]);

  const signInWithDraft = () => {
    try {
      window.sessionStorage.setItem(ANALYSIS_DRAFT_KEY, encodeAnalysisDraft({ title, source, content, focus, urlInput, parsedSourceUrl, inputMode: inputMode === 'url' ? 'url' : 'text' }));
      router.push('/login?callbackUrl=/');
    } catch { setDraftNotice('storageError'); }
  };

  const handleParseUrl = async (selectedUrl?: string, selectedArticle?: NewsArticle) => {
    const trimmed = (selectedUrl ?? urlInput).trim();
    if (!trimmed) return;
    setParseTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);

    try { new URL(trimmed); } catch {
      setParseFailure({ code: 'INVALID_URL', message: 'URL 格式无效' });
      return;
    }

    if (status !== 'authenticated') { signInWithDraft(); return; }
    parseController.current?.abort();
    const controller = new AbortController();
    parseController.current = controller;
    const current = ++parseNumber.current;
    setIsParsing(true);
    setParseFailure(null);

    try {
      const res = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (current !== parseNumber.current) return;

      if (!res.ok) {
        setSelectedNews(null);
        setParseFailure({ code: String(data.code || 'PARSE_FAILED'), message: data.error || '解析失败' });
        return;
      }

      if (data.title || selectedArticle?.title) setTitle(data.title || selectedArticle?.title || '');
      if (data.source || selectedArticle?.source) setSource(data.source || selectedArticle?.source || '');
      if (data.content) setContent(data.content);
      setParsedSourceUrl(String(data.url || trimmed));
      if (!selectedUrl) requestAnimationFrame(() => contentRef.current?.focus());
    } catch {
      if (controller.signal.aborted || current !== parseNumber.current) return;
      setSelectedNews(null);
      setParseFailure({ code: 'NETWORK_ERROR', message: '网络错误，请重试' });
    } finally {
      if (current === parseNumber.current) setIsParsing(false);
    }
  };

  useEffect(() => () => { parseController.current?.abort(); }, []);

  const handleNewsSelect = (article: NewsArticle) => {
    setSelectedNews(article);
    setUrlInput(article.url); setInputMode('url'); setParseFailure(null);
    document.getElementById('analysis')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    if (status !== 'authenticated') {
      try {
        sessionStorage.setItem(ANALYSIS_DRAFT_KEY, encodeAnalysisDraft({ title, source, content, focus, urlInput: article.url, parsedSourceUrl, inputMode: 'url' }));
        router.push('/login?callbackUrl=/');
      } catch { setDraftNotice('storageError'); }
      return;
    }
    void handleParseUrl(article.url, article);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleParseUrl();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content.trim().length < 50) return;
    if (status !== 'authenticated') { signInWithDraft(); return; }
    try { window.sessionStorage.removeItem(ANALYSIS_DRAFT_KEY); } catch {}
    onSubmit({ title, source, content, focus, mode, reportLanguage, ...(parsedSourceUrl ? { sourceUrl: parsedSourceUrl } : {}) });
  };

  const isFormValid = content.trim().length >= 50;
  const parseFailureInfo = parseFailure ? explainParseFailure(parseFailure.code) : null;

  const focusManualContent = () => {
    setParseFailure(null);
    requestAnimationFrame(() => {
      setInputMode('text');
      contentRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      contentRef.current?.focus();
    });
  };

  return (
    <>
    <Panel id="news-search">
      <div className="ui-section-heading"><div><h2>{language.startsWith('zh') ? '搜索新闻' : 'Search news'}</h2><p>{language.startsWith('zh') ? '输入关键词，查找相关报道。' : 'Find reporting on a topic that matters to you.'}</p></div><ButtonLink variant="ghost" href="/demo">{c.demoNav}</ButtonLink></div>
      <NewsSearch onSelect={handleNewsSelect} busy={isLoading || isParsing} />
    </Panel>
    <Panel id="analysis" className="scroll-mt-24">
      <div className="ui-section-heading"><div><h2>{language.startsWith('zh') ? '分析一篇报道' : 'Analyze an article'}</h2><p>{language.startsWith('zh') ? '粘贴链接获取正文，或直接输入正文。' : 'Read from a link or paste the article text below.'}</p></div></div>
      {draftNotice && <p role="status" className="mb-4 rounded-lg bg-[var(--color-primary-soft)] p-3 text-sm">{c[draftNotice]}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {selectedNews && <div className="rounded-lg bg-[var(--color-surface-muted)] p-4"><p className="text-xs text-[var(--color-text-muted)]">{isParsing ? (language.startsWith('zh') ? '正在读取报道正文…' : 'Reading article text…') : (language.startsWith('zh') ? '已选报道' : 'Selected article')}</p><h3 className="mt-1 break-words text-base font-semibold">{selectedNews.title}</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">{selectedNews.source}</p></div>}
        <div className="space-y-2">
          <label htmlFor="article-url" className="ui-label ui-field-label">{language.startsWith('zh') ? '新闻链接（可选）' : 'Article link (optional)'}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="article-url" type="text" inputMode="url" disabled={isParsing || isLoading} value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setInputMode('url'); setSelectedNews(null); setParseFailure(null); }} onKeyDown={handleKeyDown} placeholder="https://…" className="min-w-0 flex-1" />
            <Button variant="secondary" type="button" onClick={() => void handleParseUrl()} disabled={isLoading || isParsing || status === 'loading' || !urlInput.trim()} className="shrink-0">{isParsing ? t('form.parsing') : status === 'authenticated' ? c.read : c.loginRead}</Button>
          </div>
        </div>
        <div>
          <label htmlFor="content" className="ui-label ui-field-label">{t('form.contentLabel')}</label>
          <Textarea id="content" ref={contentRef} disabled={isParsing || isLoading} value={content} onChange={(e) => { setContent(e.target.value); setInputMode('text'); setParsedSourceUrl(''); }} rows={7} required minLength={50} maxLength={30000} placeholder={c.placeholder} aria-describedby="content-help" />
          <div id="content-help" className="mt-1 flex justify-between gap-3 text-xs text-[var(--color-text-muted)]"><span>{t('form.minimumLength')}</span><span>{t('form.characterCount', undefined, { count: content.length })}</span></div>
        </div>
        <details className="workspace-disclosure">
          <summary>{c.optional}</summary>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="title" className="ui-label ui-field-label">{t('form.titleLabel')}</label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} placeholder={t('form.titlePlaceholder')} /></div>
              <div><label htmlFor="source" className="ui-label ui-field-label">{t('form.sourceLabel')}</label><Input id="source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={500} placeholder={t('form.sourcePlaceholder')} /></div>
            </div>
            <div><label htmlFor="focus" className="ui-label ui-field-label">{t('form.focusLabel')}</label><Input id="focus" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={2000} placeholder={t('form.focusPlaceholder')} /></div>
          </div>
        </details>
        <TaskBudget compact onAvailabilityChange={setCanAnalyze} />
        <Button variant="primary" type="submit" disabled={isLoading || isParsing || status === 'loading' || !isFormValid || (status === 'authenticated' && !canAnalyze)} className="w-full">{isLoading ? t('form.analyzing') : status === 'authenticated' ? t('form.start') : c.continue}</Button>
      </form>

      {parseFailure && parseFailureInfo && <Dialog open onClose={() => setParseFailure(null)} title={t('parse.modalTitle')} closeLabel={t('common.close')} role="alertdialog" returnFocus={parseTrigger} description={`${t('parse.reasonLabel', undefined, { reason: t(parseFailureInfo.reasonKey) })} ${t(parseFailureInfo.explanationKey)}`}>
        <p className="rounded-lg bg-[var(--color-surface-muted)] p-4 text-sm leading-relaxed text-[var(--color-text-muted)]">{t('parse.modalInstructions')}</p>
        <div className="ui-dialog-actions">
          <Button onClick={() => void handleParseUrl()}>{t('common.retry')}</Button>
          <Button variant="primary" onClick={focusManualContent}>{t('parse.manualPaste')}</Button>
        </div>
      </Dialog>}
    </Panel>
    </>
  );
}

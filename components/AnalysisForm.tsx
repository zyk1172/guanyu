'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AnalysisMode, ReportLanguage, normalizeReportLanguage } from '../lib/types';
import { useUiLanguage } from './LanguageProvider';
import { useRouter } from 'next/navigation';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { ANALYSIS_DRAFT_KEY, encodeAnalysisDraft, decodeAnalysisDraft } from '@/lib/analysis-draft';
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
  const [isParsing, setIsParsing] = useState(false);
  const [parseFailure, setParseFailure] = useState<ParseFailure | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeParseFailureButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
    setUrlInput(articleUrl.url); setInputMode('url'); setParsedSourceUrl(''); setParseFailure(null);
  }, [articleUrl]);

  const signInWithDraft = () => {
    try {
      window.sessionStorage.setItem(ANALYSIS_DRAFT_KEY, encodeAnalysisDraft({ title, source, content, focus, urlInput, parsedSourceUrl, inputMode }));
      router.push('/login');
    } catch { setDraftNotice('storageError'); }
  };

  useEffect(() => {
    if (!parseFailure) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [],
    ).filter((element) => !element.hasAttribute('disabled'));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setParseFailure(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => closeParseFailureButtonRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [parseFailure]);

  const handleParseUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    try { new URL(trimmed); } catch {
      setParseFailure({ code: 'INVALID_URL', message: 'URL 格式无效' });
      return;
    }

    if (status !== 'authenticated') { signInWithDraft(); return; }
    setIsParsing(true);
    setParseFailure(null);

    try {
      const res = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setParseFailure({ code: String(data.code || 'PARSE_FAILED'), message: data.error || '解析失败' });
        return;
      }

      if (data.title) setTitle(data.title);
      if (data.source) setSource(data.source);
      if (data.content) setContent(data.content);
      setParsedSourceUrl(String(data.url || trimmed));
      requestAnimationFrame(() => contentRef.current?.focus());
    } catch {
      setParseFailure({ code: 'NETWORK_ERROR', message: '网络错误，请重试' });
    } finally {
      setIsParsing(false);
    }
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
    <section id="analysis" className="workspace-panel">
      <h2>{c.form}</h2>
      {draftNotice && <p role="status" className="mt-4 rounded-lg bg-[var(--color-primary-soft)] p-3 text-sm">{c[draftNotice]}</p>}
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="workspace-tabs" role="group" aria-label={t('form.manualEntry')}>
          <button type="button" aria-pressed={inputMode === 'text'} onClick={() => setInputMode('text')}>{c.text}</button>
          <button type="button" aria-pressed={inputMode === 'url'} onClick={() => setInputMode('url')}>{c.url}</button>
        </div>
        {inputMode === 'url' && <div className="space-y-2">
          <label htmlFor="article-url" className="workspace-label">{t('form.urlParser')}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="article-url" type="url" value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setParsedSourceUrl(''); setParseFailure(null); }} onKeyDown={handleKeyDown} placeholder="https://…" className="workspace-input min-w-0 flex-1" />
            <button type="button" onClick={handleParseUrl} disabled={isLoading || isParsing || status === 'loading' || !urlInput.trim()} className="workspace-button workspace-secondary shrink-0 disabled:opacity-50">{isParsing ? t('form.parsing') : status === 'authenticated' ? c.read : c.loginRead}</button>
          </div>
        </div>}
        <div>
          <label htmlFor="content" className="workspace-label">{t('form.contentLabel')}</label>
          <textarea id="content" ref={contentRef} value={content} onChange={(e) => { setContent(e.target.value); setParsedSourceUrl(''); }} rows={7} required minLength={50} maxLength={30000} placeholder={c.placeholder} aria-describedby="content-help" className="workspace-input resize-y" />
          <div id="content-help" className="mt-1 flex justify-between gap-3 text-xs text-[var(--color-text-muted)]"><span>{t('form.minimumLength')}</span><span>{t('form.characterCount', undefined, { count: content.length })}</span></div>
        </div>
        <details className="workspace-disclosure">
          <summary>{c.optional}</summary>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="title" className="workspace-label">{t('form.titleLabel')}</label><input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} placeholder={t('form.titlePlaceholder')} className="workspace-input" /></div>
              <div><label htmlFor="source" className="workspace-label">{t('form.sourceLabel')}</label><input id="source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={500} placeholder={t('form.sourcePlaceholder')} className="workspace-input" /></div>
            </div>
            <div><label htmlFor="focus" className="workspace-label">{t('form.focusLabel')}</label><input id="focus" value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={2000} placeholder={t('form.focusPlaceholder')} className="workspace-input" /></div>
          </div>
        </details>
        <TaskBudget compact />
        <button type="submit" disabled={isLoading || isParsing || status === 'loading' || !isFormValid} className="workspace-button workspace-primary w-full">{isLoading ? t('form.analyzing') : status === 'authenticated' ? t('form.start') : c.continue}</button>
      </form>

      {parseFailure && parseFailureInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="parse-failure-title"
          aria-describedby="parse-failure-description"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setParseFailure(null);
          }}
        >
          <div ref={modalRef} className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-warning)]" aria-hidden="true">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 id="parse-failure-title" className="text-sm font-black text-[var(--color-text)]">{t('parse.modalTitle')}</h3>
                  <button ref={closeParseFailureButtonRef} type="button" onClick={() => setParseFailure(null)} className="rounded p-1 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]" aria-label={t('common.close')}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>
                  </button>
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--color-text)]">{t('parse.reasonLabel', undefined, { reason: t(parseFailureInfo.reasonKey) })}</p>
                <p id="parse-failure-description" className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{t(parseFailureInfo.explanationKey)}</p>
                <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {t('parse.modalInstructions')}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={handleParseUrl} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)]">
                {t('common.retry')}
              </button>
              <button type="button" onClick={focusManualContent} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98]">
                {t('parse.manualPaste')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

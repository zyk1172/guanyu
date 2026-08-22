import React, { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AnalysisMode, ReportLanguage, normalizeReportLanguage } from '../lib/types';
import { useUiLanguage } from './LanguageProvider';
import { useActiveModel } from './useActiveModel';

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

export default function AnalysisForm({ onSubmit, isLoading }: AnalysisFormProps) {
  const { status } = useSession();
  const { language, t } = useUiLanguage();
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
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const activeModel = useActiveModel('analysis');
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeParseFailureButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      setCreditBalance(null);
      return;
    }
    fetch('/api/billing/status')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const value = Number(data?.creditBalance);
        setCreditBalance(Number.isFinite(value) ? value : null);
      })
      .catch(() => setCreditBalance(null));
  }, [status]);

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
    onSubmit({ title, source, content, focus, mode, reportLanguage, ...(parsedSourceUrl ? { sourceUrl: parsedSourceUrl } : {}) });
  };

  const isFormValid = content.trim().length >= 50;
  const parseFailureInfo = parseFailure ? explainParseFailure(parseFailure.code) : null;

  const focusManualContent = () => {
    setParseFailure(null);
    requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      contentRef.current?.focus();
    });
  };

  return (
    <div data-rss-form-height className="animated-panel space-y-4 bg-white dark:bg-gray-950 p-3 sm:p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-shadow duration-300">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-900 pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-gray-950 dark:text-white">{t('form.title')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('form.description')}</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xxs font-bold text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
          {status === 'authenticated' ? t('form.signedIn') : t('form.signInRequired')}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        {/* URL 自动解析区 */}
        <div className="space-y-2">
          <label htmlFor="article-url" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('form.urlParser')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="article-url"
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setParsedSourceUrl(''); setParseFailure(null); }}
              onKeyDown={handleKeyDown}
              placeholder={t('form.urlPlaceholder')}
              className="interactive-lift min-w-0 flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
            <button
              type="button"
              onClick={handleParseUrl}
              disabled={isParsing || !urlInput.trim()}
              className="interactive-lift justify-center px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {isParsing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('form.parsing')}
                </>
              ) : (
                t('form.parse')
              )}
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-800" /></div>
          <div className="relative flex justify-center"><span className="bg-white dark:bg-gray-950 px-3 text-xs text-gray-400">{t('form.manualEntry')}</span></div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="title" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('form.titleLabel')}
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('form.titlePlaceholder')}
              className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="source" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('form.sourceLabel')}
            </label>
            <input
              id="source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t('form.sourcePlaceholder')}
              className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="content" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('form.contentLabel')} <span className="text-red-500">*</span>
          </label>
          <textarea
            id="content"
            ref={contentRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); setParsedSourceUrl(''); }}
            rows={8}
            required
            placeholder={t('form.contentPlaceholder')}
            className="interactive-lift w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed dark:text-white"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{t('form.minimumLength')}</span>
            <span>{t('form.characterCount', undefined, { count: content.length })}</span>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="focus" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('form.focusLabel')}
          </label>
          <input
            id="focus"
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={t('form.focusPlaceholder')}
            className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold leading-relaxed text-[var(--color-text)]">
          <span>{activeModel.source === 'custom'
            ? t('modelSelector.customCharge', '本次使用自定义 API，不消耗平台点数。')
            : t('modelSelector.estimatedCharge', '预计消耗 {credits} 点；仅在报告成功保存后扣除。', { credits: activeModel.estimatedCost })}</span>
          {creditBalance !== null && (
            <span className="shrink-0 font-black text-[var(--color-primary)]">
              {t('billing.remainingCredits', undefined, { credits: Number.isInteger(creditBalance) ? String(creditBalance) : creditBalance.toFixed(1) })}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className={`interactive-lift w-full py-2.5 px-4 rounded-lg font-semibold text-sm shadow-sm transition duration-150 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:cursor-not-allowed disabled:hover:transform-none ${
            isFormValid
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg hover:shadow-indigo-500/20'
              : 'bg-gray-300 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
          }`}
        >
          {isLoading ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-white/90 step-pulse" />
              {t('form.analyzing')}
            </>
          ) : (
            t('form.start')
          )}
        </button>
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
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUiLanguage } from '@/components/LanguageProvider';

export type RssHeadline = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string;
};

type RssSource = {
  id: string;
  name: string;
  nameZh: string;
};

type RssPayload = {
  sources: RssSource[];
  headlines: RssHeadline[];
  sourceErrors?: Array<{ sourceId: string; message: string }>;
};

export default function RssNewsPanel({
  onAnalyzeHeadline,
  isAnalyzing,
  desktopHeight,
}: {
  onAnalyzeHeadline: (headline: RssHeadline) => Promise<void> | void;
  isAnalyzing: boolean;
  desktopHeight?: number;
}) {
  const { language, t } = useUiLanguage();
  const [payload, setPayload] = useState<RssPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSourceId, setActiveSourceId] = useState('all');
  const [activeHeadlineId, setActiveHeadlineId] = useState('');
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const isPointerInsideRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const manualPauseUntilRef = useRef(0);

  const loadHeadlines = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/rss/headlines', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t('rss.loadFailed'));
      setPayload(data);
    } catch {
      // Server diagnostics are intentionally not shown as UI copy: they may be
      // in a different language and do not help the reader recover.
      setError(t('rss.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadHeadlines();
    const timer = window.setInterval(() => void loadHeadlines(), 3 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadHeadlines]);

  useEffect(() => {
    let frameId = 0;
    let previousTime = 0;

    const advance = (time: number) => {
      const viewport = scrollViewportRef.current;
      const elapsed = Math.min(time - previousTime, 80);
      previousTime = time;

      if (
        viewport
        && viewport.scrollHeight > viewport.clientHeight
        && !isPointerInsideRef.current
        && time >= manualPauseUntilRef.current
      ) {
        const distanceToEnd = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
        isAutoScrollingRef.current = true;
        if (distanceToEnd <= 1) {
          viewport.scrollTop = 0;
          manualPauseUntilRef.current = time + 1800;
        } else {
          viewport.scrollTop += elapsed * 0.012;
        }
        window.requestAnimationFrame(() => { isAutoScrollingRef.current = false; });
      }

      frameId = window.requestAnimationFrame(advance);
    };

    frameId = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSourceId, payload?.headlines.length]);

  const headlines = useMemo(() => {
    const all = payload?.headlines || [];
    return activeSourceId === 'all' ? all : all.filter((headline) => headline.sourceId === activeSourceId);
  }, [activeSourceId, payload]);

  const sourceName = (source: RssSource) => language === 'zh-CN' ? source.nameZh || source.name : source.name;

  const handleAnalyze = async (headline: RssHeadline) => {
    setActiveHeadlineId(headline.id);
    try {
      await onAnalyzeHeadline(headline);
    } finally {
      setActiveHeadlineId('');
    }
  };

  return (
    <aside
      style={{ '--rss-panel-height': `${(desktopHeight || 748) + 5}px` } as React.CSSProperties}
      className="animated-panel flex min-h-[34rem] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-card)] lg:min-h-0 lg:h-[var(--rss-panel-height)]"
    >
      <div className="border-b border-[var(--color-border)] px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-[var(--color-text)]">{t('rss.title')}</h2>
            <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('rss.description')}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadHeadlines()}
            disabled={isLoading || isAnalyzing}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xxs font-bold text-[var(--color-link)] transition hover:bg-[var(--color-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? t('rss.loading') : t('rss.refresh')}
          </button>
        </div>

        {payload?.sources?.length ? (
          <label className="mt-3 block">
            <span className="sr-only">{t('rss.sourceFilter')}</span>
            <select
              value={activeSourceId}
              onChange={(event) => setActiveSourceId(event.target.value)}
              className="w-full rounded-md border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2 py-1.5 text-xxs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            >
              <option value="all">{t('rss.allSources', undefined, { count: payload.sources.length })}</option>
              {payload.sources.map((source) => <option key={source.id} value={source.id}>{sourceName(source)}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div
        ref={scrollViewportRef}
        onPointerEnter={() => { isPointerInsideRef.current = true; }}
        onPointerLeave={() => { isPointerInsideRef.current = false; }}
        onWheel={() => { manualPauseUntilRef.current = performance.now() + 8000; }}
        onTouchStart={() => { manualPauseUntilRef.current = performance.now() + 8000; }}
        onScroll={() => {
          if (!isAutoScrollingRef.current) manualPauseUntilRef.current = performance.now() + 8000;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 scrollbar-thin"
      >
        {isLoading ? (
          <div className="px-2 py-8 text-center text-xs font-semibold text-[var(--color-text-muted)]">{t('rss.loading')}</div>
        ) : error ? (
          <div className="space-y-2 px-2 py-5 text-center">
            <p className="text-xs font-semibold text-[var(--color-danger)]">{error}</p>
            <button type="button" onClick={() => void loadHeadlines()} className="text-xs font-bold text-[var(--color-link)]">{t('common.retry')}</button>
          </div>
        ) : headlines.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--color-text-muted)]">{t('rss.empty')}</p>
        ) : (
          <div className="space-y-1.5">
            {headlines.map((headline) => {
              const isActive = isAnalyzing || activeHeadlineId === headline.id;
              return (
                <article key={headline.id} className="group rounded-lg border border-transparent px-2.5 py-2 transition hover:border-[var(--color-border)] hover:bg-[var(--color-card-hover)]">
                  <div className="flex items-center justify-between gap-2 text-xxs font-bold text-[var(--color-text-subtle)]">
                    <span className="truncate">{headline.sourceName}</span>
                    <time className="shrink-0">{headline.publishedAt ? new Date(headline.publishedAt).toLocaleDateString(language) : t('common.unknown')}</time>
                  </div>
                  <a href={headline.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold leading-snug text-[var(--color-text)] underline-offset-2 hover:text-[var(--color-link)] hover:underline">
                    {headline.title}
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleAnalyze(headline)}
                    disabled={isActive}
                    className="mt-1.5 text-xxs font-black text-[var(--color-link)] transition hover:text-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isActive && activeHeadlineId === headline.id ? t('rss.starting') : t('rss.startAnalysis')}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {payload?.sourceErrors?.length ? (
        <p className="border-t border-[var(--color-border)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-subtle)]">
          {t('rss.partialUnavailable', undefined, { count: payload.sourceErrors.length })}
        </p>
      ) : null}
      <p className="border-t border-[var(--color-border)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-subtle)]">{t('rss.termsNotice')}</p>
    </aside>
  );
}

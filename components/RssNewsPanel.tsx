'use client';

import { useUiLanguage } from '@/components/LanguageProvider';
import { Button, Select } from '@/components/ui/controls';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
}: {
  onAnalyzeHeadline: (headline: RssHeadline) => Promise<void> | void;
  isAnalyzing: boolean;
}) {
  const { language, t } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const [payload, setPayload] = useState<RssPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSourceId, setActiveSourceId] = useState('all');
  const [activeHeadlineId, setActiveHeadlineId] = useState('');
  const loadHeadlines = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/rss/headlines', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
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

  const headlines = useMemo(() => {
    const all = payload?.headlines || [];
    return activeSourceId === 'all' ? all : all.filter((headline) => headline.sourceId === activeSourceId);
  }, [activeSourceId, payload]);

  const allSourcesUnavailable = Boolean(payload?.sources.length)
    && payload?.sources.every((source) => payload.sourceErrors?.some((error) => error.sourceId === source.id))
    && !payload?.headlines.length;

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
    <section className="flex w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="border-b border-[var(--color-border)] px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--color-text)]">{t('rss.title')}</h2>
            <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{c.rssDescription}</p>
          </div>
          <Button variant="secondary"
            type="button"
            onClick={() => void loadHeadlines()}
            disabled={isLoading || isAnalyzing}
            className="shrink-0"
         >
            {isLoading ? t('rss.loading') : t('rss.refresh')}
          </Button>
        </div>

        {payload?.sources?.length ? (
          <label className="ui-label mt-3 block">
            <span className="sr-only">{t('rss.sourceFilter')}</span>
            <Select
              value={activeSourceId}
              onChange={(event) => setActiveSourceId(event.target.value)}
              className="w-full"
           >
              <option value="all">{t('rss.allSources', undefined, { count: payload.sources.length })}</option>
              {payload.sources.map((source) => <option key={source.id} value={source.id}>{sourceName(source)}</option>)}
            </Select>
          </label>
        ) : null}

      </div>

      <div className="max-h-[28rem] overflow-y-auto overscroll-contain px-2 py-2 scrollbar-thin" tabIndex={0} role="region" aria-label={t('rss.title')}>
        {isLoading ? (
          <div className="px-2 py-8 text-center text-xs font-semibold text-[var(--color-text-muted)]">{t('rss.loading')}</div>
        ) : error ? (
          <div className="space-y-2 px-2 py-5 text-center">
            <p className="text-xs font-semibold text-[var(--color-danger)]">{error}</p>
            <Button variant="ghost" type="button" onClick={() => void loadHeadlines()}>{t('common.retry')}</Button>
          </div>
        ) : headlines.length === 0 ? (
          <p role="status" className="px-2 py-8 text-center text-xs text-[var(--color-text-muted)]">{t(allSourcesUnavailable ? 'rss.allUnavailable' : 'rss.empty')}</p>
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
                  <Button variant="ghost"
                    type="button"
                    onClick={() => void handleAnalyze(headline)}
                    disabled={isActive}
                    className="mt-1.5"
                 >
                    {isActive && activeHeadlineId === headline.id ? t('rss.starting') : c.read}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {!error && !isLoading && payload?.sourceErrors?.length && payload.headlines.length ? (
        <p className="border-t border-[var(--color-border)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-subtle)]">
          {t('rss.partialUnavailable', undefined, { count: payload.sourceErrors.length })}
        </p>
      ) : null}
      <p className="border-t border-[var(--color-border)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-subtle)]">{t('rss.termsNotice')}</p>
    </section>
  );
}

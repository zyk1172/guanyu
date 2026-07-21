'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AnalysisForm from '../components/AnalysisForm';
import AnalysisResultView from '../components/AnalysisResult';
import LoadingState from '../components/LoadingState';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import { GsapReveal } from '../components/GsapMotion';
import { useUiLanguage } from '../components/LanguageProvider';
import RssNewsPanel, { RssHeadline } from '../components/RssNewsPanel';
import { AnalysisResult, AnalysisMode, ReportLanguage, getReportLanguageLabel, getThinkingDepthLabel } from '../lib/types';
import { getBrandIdentity } from '../lib/brand-core.mjs';
import {
  ACTIVE_ANALYSIS_JOB_STORAGE_KEY,
  getAnalysisJobResolution,
  normalizeActiveAnalysisJobId,
} from '../lib/analysis-job-client-core.mjs';
import type { ModelSourceSelection } from '../components/PlatformModelSelector';

interface HotAudit {
  id: string;
  title: string;
  source: string;
  newsSummary: string;
  modelName: string;
  reasoningDepth: string;
  reportLanguage: string;
  credibilityScore: number;
  speculationRiskScore: number;
  viewCount: number;
  createdAt: string;
}

interface AuditSubmitData {
  title: string;
  source: string;
  content: string;
  focus: string;
  mode: AnalysisMode;
  reportLanguage: ReportLanguage;
  sourceUrl?: string;
  modelSource: ModelSourceSelection;
  platformModelConfigId?: string;
}

export default function Home() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { language, t } = useUiLanguage();
  const brand = getBrandIdentity(language);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<AuditSubmitData | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [hotAudits, setHotAudits] = useState<HotAudit[]>([]);
  const [isLoadingHotAudits, setIsLoadingHotAudits] = useState(true);
  const [showBrowseGate, setShowBrowseGate] = useState(false);
  const formColumnRef = useRef<HTMLDivElement | null>(null);
  const [formColumnHeight, setFormColumnHeight] = useState(748);
  const activePollingJobRef = useRef<string | null>(null);
  const pageIsMountedRef = useRef(true);

  const storeActiveJob = useCallback((jobId: string) => {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(ACTIVE_ANALYSIS_JOB_STORAGE_KEY, jobId);
    setActiveJobId(jobId);
  }, []);

  const clearActiveJob = useCallback(() => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(ACTIVE_ANALYSIS_JOB_STORAGE_KEY);
    setActiveJobId(null);
  }, []);

  const pollAnalysisJob = useCallback(async (jobId: string) => {
    const normalizedJobId = normalizeActiveAnalysisJobId(jobId);
    if (!normalizedJobId || activePollingJobRef.current === normalizedJobId) return;

    activePollingJobRef.current = normalizedJobId;
    let terminalFailure = false;
    if (pageIsMountedRef.current) {
      setIsLoading(true);
      setError(null);
      setActiveJobId(normalizedJobId);
    }

    try {
      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt < 10 ? 1500 : 3000));
        const statusResponse = await fetch(`/api/analyze/jobs/${normalizedJobId}`, { cache: 'no-store' });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
          throw new Error(statusData.error || '读取审视任务状态失败。');
        }

        const resolution = getAnalysisJobResolution(statusData);
        if (resolution.kind === 'completed') {
          clearActiveJob();
          router.push(`/audits/${resolution.auditId}`);
          return;
        }
        if (resolution.kind === 'failed') {
          terminalFailure = true;
          clearActiveJob();
          throw new Error(resolution.error);
        }
      }
    } catch (pollError: any) {
      if (!pageIsMountedRef.current) return;
      setError(terminalFailure
        ? (pollError?.message || '审视任务生成失败。')
        : '审视仍在后台生成，状态暂时无法读取。返回此页面后会继续恢复任务。');
    } finally {
      if (activePollingJobRef.current === normalizedJobId) activePollingJobRef.current = null;
      if (pageIsMountedRef.current) setIsLoading(false);
    }
  }, [clearActiveJob, router]);

  useEffect(() => {
    pageIsMountedRef.current = true;
    return () => {
      pageIsMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const resumeStoredJob = () => {
      if (typeof window === 'undefined') return;
      const jobId = normalizeActiveAnalysisJobId(window.sessionStorage.getItem(ACTIVE_ANALYSIS_JOB_STORAGE_KEY));
      if (!jobId) return;
      storeActiveJob(jobId);
      void pollAnalysisJob(jobId);
    };

    const resumeWhenVisible = () => {
      if (document.visibilityState === 'visible') resumeStoredJob();
    };

    resumeStoredJob();
    document.addEventListener('visibilitychange', resumeWhenVisible);
    return () => document.removeEventListener('visibilitychange', resumeWhenVisible);
  }, [pollAnalysisJob, storeActiveJob]);

  useEffect(() => {
    const target = formColumnRef.current;
    if (!target) return;
    const form = target.querySelector<HTMLElement>('[data-rss-form-height]');

    const updateHeight = () => {
      const nextHeight = Math.ceil((form || target).getBoundingClientRect().height);
      if (nextHeight > 0) setFormColumnHeight((current) => current === nextHeight ? current : nextHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(target);
    if (form) observer.observe(form);
    const animationFrame = requestAnimationFrame(updateHeight);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchHotAudits() {
      try {
        const response = await fetch('/api/audits/hot?limit=6');
        if (!response.ok) return;
        const data = await response.json();
        if (isMounted) setHotAudits(data);
      } finally {
        if (isMounted) setIsLoadingHotAudits(false);
      }
    }

    fetchHotAudits();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAnalyze = async (data: AuditSubmitData) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setLastSubmittedData(data);
    clearActiveJob();

    try {
      const response = await fetch('/api/analyze/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || `请求失败 (${response.status})`);
      }

      const jobId = resData.jobId;
      if (!jobId) throw new Error('服务端未返回审视任务 ID。');
      storeActiveJob(jobId);
      await pollAnalysisJob(jobId);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '网络连接或请求处理出错，请重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeRssHeadline = async (headline: RssHeadline, model: { modelSource: ModelSourceSelection; platformModelConfigId?: string }) => {
    setError(null);
    try {
      const response = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: headline.url }),
      });
      const article = await response.json().catch(() => ({}));
      if (!response.ok || !article.content || String(article.content).trim().length < 50) {
        throw new Error(t('rss.parseFailed'));
      }
      await handleAnalyze({
        title: article.title || headline.title,
        source: article.source || headline.sourceName,
        content: article.content,
        focus: '',
        mode: 'deep',
        reportLanguage: language,
        sourceUrl: article.url || headline.url,
        ...model,
      });
    } catch (rssError: any) {
      setError(rssError?.message || t('rss.parseFailed'));
    }
  };

  const handleRetry = () => {
    if (activeJobId) {
      void pollAnalysisJob(activeJobId);
      return;
    }
    if (lastSubmittedData) {
      handleAnalyze(lastSubmittedData);
    }
  };

  const getDepthLabel = (depth: string) => getThinkingDepthLabel(depth, language);

  return (
    <main className="relative min-h-screen overflow-hidden bg-gray-50 dark:bg-black font-sans leading-normal tracking-normal text-gray-900 dark:text-gray-100 selection:bg-indigo-500/20">
      <div data-gsap-drift className="ambient-glow pointer-events-none absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-700/10" />
      <div data-gsap-drift className="ambient-glow pointer-events-none absolute right-[-6rem] top-72 h-60 w-60 rounded-full bg-sky-200/30 blur-3xl dark:bg-sky-700/10" />

      <Header />

      {/* 主体内容 */}
      <GsapReveal className="relative z-10 max-w-6xl mx-auto px-3 sm:px-4 py-4 md:py-6 space-y-4">
        {/* Slogan */}
        <div data-gsap-reveal className="flex flex-col gap-2 border-b border-gray-100 pb-3 dark:border-gray-900 md:flex-row md:items-end md:justify-between">
          <div className="max-w-4xl space-y-2">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
              {brand.name}
            </h1>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              {t('brand.tagline')}
            </p>
            <p className="max-w-3xl text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-normal">
              {t('home.description')}
            </p>
          </div>
        </div>

        {/* 桌面端：新闻审视输入占 3/4，RSS 标题流占 1/4。 */}
        <div data-gsap-reveal className="mx-auto max-w-6xl space-y-4">
          <div className="grid items-stretch gap-4 lg:grid-cols-4">
            <div ref={formColumnRef} className="lg:col-span-3 h-full">
              <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} />
            </div>
            <div className="lg:col-span-1 h-full">
              <RssNewsPanel
                onAnalyzeHeadline={handleAnalyzeRssHeadline}
                isAnalyzing={isLoading}
                desktopHeight={formColumnHeight}
              />
            </div>
          </div>
          {isLoading && <LoadingState />}
          {activeJobId && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
              {t('home.backgroundJob')}
            </div>
          )}
          {error && <ErrorMessage message={error} onRetry={handleRetry} />}
          {result && !isLoading && !error && (
            <div data-gsap-reveal className="border-t border-gray-100 dark:border-gray-900 pt-5">
              <div className="text-center mb-5">
                <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 rounded-full text-xs font-semibold tracking-wider uppercase mb-2">
                  REVIEW REPORT
                </span>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('home.reportTitle')}</h3>
              </div>
              <AnalysisResultView
                result={result}
                originalContent={lastSubmittedData?.content}
                auditMeta={{
                  title: lastSubmittedData?.title,
                  source: lastSubmittedData?.source,
                  analysisMode: lastSubmittedData?.mode,
                }}
              />
            </div>
          )}

          <section className="animated-panel rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-900">
              <h2 className="text-sm font-black text-gray-950 dark:text-white">{t('home.hotTitle')}</h2>
              <span className="text-xxs font-bold text-gray-400">{t('home.hotOrder')}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {t('home.hotDescription')}
            </p>
            <div className="mt-3 space-y-3">
              {isLoadingHotAudits ? (
                <div className="py-8 text-center text-xs font-semibold text-gray-400">{t('home.loadingHot')}</div>
              ) : hotAudits.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400 dark:border-gray-800">
                  {t('home.noHot')}
                </div>
              ) : (
                hotAudits.slice(0, 6).map((audit) => (
                  <article key={audit.id} className="interactive-lift rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900/60">
                    <div className="flex flex-wrap items-center gap-1.5 text-xxs font-bold text-gray-400">
                      <span>{audit.source || t('home.unknownSource')}</span>
                      <span>·</span>
                      <span>{new Date(audit.createdAt).toLocaleDateString(language)}</span>
                      <span>·</span>
                      <span>{t('home.views', undefined, { count: audit.viewCount })}</span>
                    </div>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-gray-950 dark:text-white">{audit.title}</h3>
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {audit.newsSummary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xxs font-bold">
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">{audit.modelName}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{getDepthLabel(audit.reasoningDepth)}</span>
                      <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">{getReportLanguageLabel(audit.reportLanguage, language)}</span>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{t('home.credibility', undefined, { score: audit.credibilityScore })}</span>
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{t('home.risk', undefined, { score: audit.speculationRiskScore })}</span>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Link href={`/audits/${audit.id}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700">
                        {t('common.viewDetails')}
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
            {hotAudits.length > 0 && (sessionStatus === 'authenticated' ? (
              <Link href="/audits" className="mt-3 block rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
                {t('home.more')}
              </Link>
            ) : (
              <button type="button" onClick={() => setShowBrowseGate(true)} className="mt-3 block w-full rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
                {t('home.more')}
              </button>
            ))}
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
            <h2 className="text-sm font-black text-gray-950 dark:text-white">{t('home.usageTitle')}</h2>
            <ul className="mt-2 space-y-1.5">
              <li>{t('home.usageOne')}</li>
              <li>{t('home.usageTwo')}</li>
              <li>{t('home.usageThree')}</li>
            </ul>
          </section>
        </div>
      </GsapReveal>

      {showBrowseGate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={language.startsWith('zh-') ? '登录后继续浏览' : 'Sign in to continue browsing'}>
          <section className="w-full max-w-sm rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 shadow-2xl">
            <h2 className="text-base font-black text-[var(--color-text)]">{language.startsWith('zh-') ? '登录后浏览全部公开报告' : 'Sign in to browse all public reports'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{language.startsWith('zh-') ? '注册或登录后，可查看更多公开报告并管理自己的审视记录。' : 'Create an account or sign in to view more public reports and manage your own reviews.'}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowBrowseGate(false)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-bold text-[var(--color-text-muted)] transition hover:bg-[var(--color-card-hover)]">{language.startsWith('zh-') ? '暂不' : 'Not now'}</button>
              <Link href="/register" className="rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition hover:bg-[var(--color-card-hover)]">{language.startsWith('zh-') ? '注册' : 'Register'}</Link>
              <Link href="/login" className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--color-primary-hover)]">{language.startsWith('zh-') ? '登录' : 'Sign in'}</Link>
            </div>
          </section>
        </div>
      )}

      {/* 极简页脚 */}
      <footer className="relative z-10 border-t border-gray-100 dark:border-gray-900 bg-white dark:bg-gray-950 py-8 mt-16 text-center text-xs text-gray-400 dark:text-gray-500">
        <div className="max-w-6xl mx-auto px-4 space-y-2 font-medium">
          <p>{t('footer.rights', `© 2026 ${brand.name}. All rights reserved.`, { brand: brand.name })}</p>
          <p className="text-xxs">{t('home.disclaimer')}</p>
        </div>
      </footer>
    </main>
  );
}

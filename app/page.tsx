'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AnalysisForm from '../components/AnalysisForm';
import AnalysisResultView from '../components/AnalysisResult';
import LoadingState from '../components/LoadingState';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import { GsapReveal } from '../components/GsapMotion';
import { useUiLanguage } from '../components/LanguageProvider';
import { AnalysisResult, AnalysisMode, ReportLanguage, getReportLanguageLabel, getThinkingDepthLabel } from '../lib/types';

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
}

export default function Home() {
  const router = useRouter();
  const { language, t } = useUiLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<AuditSubmitData | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [hotAudits, setHotAudits] = useState<HotAudit[]>([]);
  const [isLoadingHotAudits, setIsLoadingHotAudits] = useState(true);

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
    setActiveJobId(null);

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
      setActiveJobId(jobId);

      for (let attempt = 0; attempt < 180; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt < 10 ? 1500 : 3000));
        const statusResponse = await fetch(`/api/analyze/jobs/${jobId}`, { cache: 'no-store' });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
          throw new Error(statusData.error || '读取审视任务状态失败。');
        }
        if (statusData.status === 'completed' && statusData.auditId) {
          router.push(`/audits/${statusData.auditId}`);
          return;
        }
        if (statusData.status === 'failed') {
          throw new Error(statusData.error || '审视任务生成失败。');
        }
      }

      throw new Error('审视仍在后台生成，请稍后到“我的审视”查看。');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '网络连接或请求处理出错，请重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
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
              观隅
            </h1>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              {t('brand.tagline')}
            </p>
            <p className="max-w-3xl text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-normal">
              {t('home.description')}
            </p>
          </div>
        </div>

        {/* 表单、结果与热门审视：桌面端统一单列同宽 */}
        <div data-gsap-reveal className="mx-auto max-w-5xl space-y-4">
          <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} />
          {isLoading && <LoadingState />}
          {isLoading && activeJobId && (
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
            {hotAudits.length > 0 && (
              <Link href="/audits" className="mt-3 block rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
                {t('home.more')}
              </Link>
            )}
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

      {/* 极简页脚 */}
      <footer className="relative z-10 border-t border-gray-100 dark:border-gray-900 bg-white dark:bg-gray-950 py-8 mt-16 text-center text-xs text-gray-400 dark:text-gray-500">
        <div className="max-w-6xl mx-auto px-4 space-y-2 font-medium">
          <p>© 2026 观隅. 保留所有权利。</p>
          <p className="text-xxs">{t('home.disclaimer')}</p>
        </div>
      </footer>
    </main>
  );
}

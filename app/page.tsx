'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AnalysisForm from '../components/AnalysisForm';
import LoadingState from '../components/LoadingState';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import { GsapReveal } from '../components/GsapMotion';
import { useUiLanguage } from '../components/LanguageProvider';
import { AnalysisMode, ReportLanguage } from '../lib/types';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import SiteFooter from '@/components/SiteFooter';
import { ArrowUpRight } from 'lucide-react';
import {
  ACTIVE_ANALYSIS_JOB_STORAGE_KEY,
  ANALYSIS_JOB_POLLING_ATTEMPTS,
  getAnalysisJobResolution,
  getAnalysisJobPollingDelay,
  normalizeActiveAnalysisJobId,
} from '../lib/analysis-job-client-core.mjs';

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
}

export default function Home() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { language, t } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<AuditSubmitData | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [hotAudits, setHotAudits] = useState<HotAudit[]>([]);
  const [isLoadingHotAudits, setIsLoadingHotAudits] = useState(true);
  const submitting = useRef(false);
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
      for (let attempt = 0; attempt < ANALYSIS_JOB_POLLING_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, getAnalysisJobPollingDelay(attempt)));
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
    if (submitting.current) return;
    submitting.current = true;
    setIsLoading(true);
    setError(null);
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
      submitting.current = false;
      setIsLoading(false);
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

  return (
    <main className="workspace-page">
      <Header />
      <GsapReveal className="workspace-container">
        <section data-gsap-reveal className="workspace-hero">
          <h1>{language.startsWith('zh-') ? <><span className="inline-block">{c.headline.split('，')[0]}，</span><wbr /><span className="inline-block">{c.headline.split('，')[1]}</span></> : c.headline}</h1>
          <p>{c.subtitle}</p>
        </section>
        <div data-gsap-reveal className="space-y-5">
            <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} />
            {isLoading && <LoadingState />}
            {activeJobId && !isLoading && <p role="status" className="text-sm text-[var(--color-text-muted)]">{t('home.backgroundJob')}</p>}
            {error && <ErrorMessage message={error} onRetry={handleRetry} />}
        </div>
        <section className="workspace-panel mt-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2>{c.public}</h2>
            <Link href={sessionStatus === 'authenticated' ? '/audits' : '/login'} className="workspace-link">{sessionStatus === 'authenticated' ? t('home.more') : c.continue}<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          {isLoadingHotAudits ? <p role="status" className="py-6 text-sm text-[var(--color-text-muted)]">{t('home.loadingHot')}</p> : hotAudits.length === 0 ? <p className="py-6 text-sm text-[var(--color-text-muted)]">{t('home.noHot')} <Link href="/demo" className="underline">{c.demoLink}</Link></p> : hotAudits.map((audit) => <article key={audit.id} className="public-review-row">
            <div>
              <h3><Link href={`/audits/${audit.id}`}>{audit.title}</Link></h3>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{audit.newsSummary}</p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{audit.source || t('home.unknownSource')} · {t('home.views', undefined, { count: audit.viewCount })}</p>
            </div>
            <time dateTime={audit.createdAt} className="text-xs text-[var(--color-text-muted)]">{new Date(audit.createdAt).toLocaleDateString(language)}</time>
          </article>)}
        </section>
      </GsapReveal>
      <SiteFooter />
    </main>
  );
}

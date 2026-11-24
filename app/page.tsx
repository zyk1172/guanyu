'use client';

import SiteFooter from '@/components/SiteFooter';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import AnalysisForm from '../components/AnalysisForm';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import { useUiLanguage } from '../components/LanguageProvider';
import LoadingState from '../components/LoadingState';
import {
  ACTIVE_ANALYSIS_JOB_STORAGE_KEY,
  ANALYSIS_JOB_POLLING_ATTEMPTS,
  getAnalysisJobPollingDelay,
  getAnalysisJobResolution,
  normalizeActiveAnalysisJobId,
} from '../lib/analysis-job-client-core.mjs';
import { AnalysisMode, ReportLanguage } from '../lib/types';

interface AuditSubmitData {
  title: string;
  source: string;
  content: string;
  focus: string;
  mode: AnalysisMode;
  reportLanguage: ReportLanguage;
  sourceUrl?: string;
}

function waitForPoll(delay: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, delay);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export default function Home() {
  const router = useRouter();
  const { language,t } = useUiLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<AuditSubmitData | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const submitting = useRef(false);
  const pendingSubmission = useRef<{ input: AuditSubmitData; requestId: string } | null>(null);
  const activePollingJobRef = useRef<{ jobId: string; controller: AbortController } | null>(null);
  const pageIsMountedRef = useRef(true);
  const errorPanel = useRef<HTMLDivElement>(null);
  const progressPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(isLoading)progressPanel.current?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})},[isLoading]);
  useEffect(() => {
    if (!error) return;
    errorPanel.current?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    errorPanel.current?.focus({ preventScroll: true });
  }, [error]);

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
    if (!normalizedJobId || activePollingJobRef.current?.jobId === normalizedJobId) return;
    activePollingJobRef.current?.controller.abort();
    const controller = new AbortController();
    activePollingJobRef.current = { jobId: normalizedJobId, controller };
    let terminalFailure = false;
    if (pageIsMountedRef.current) {
      setIsLoading(true);
      setError(null);
      setActiveJobId(normalizedJobId);
    }

    try {
      for (let attempt = 0; attempt < ANALYSIS_JOB_POLLING_ATTEMPTS; attempt += 1) {
        await waitForPoll(getAnalysisJobPollingDelay(attempt), controller.signal);
        if (controller.signal.aborted) return;
        const statusResponse = await fetch(`/api/analyze/jobs/${normalizedJobId}`, {
          cache: 'no-store', signal: controller.signal,
        }).catch(() => null);
        if (controller.signal.aborted) return;
        if (!statusResponse || statusResponse.status >= 500 || statusResponse.status === 429) continue;
        const statusData = await statusResponse.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!statusResponse.ok) {
          terminalFailure = true;
          clearActiveJob();
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
      throw new Error('等待审视任务超时。');
    } catch (pollError: any) {
      if (!pageIsMountedRef.current || controller.signal.aborted) return;
      setError(terminalFailure
        ? (pollError?.message || '审视任务生成失败。')
        : '审视仍在后台生成，状态暂时无法读取。返回此页面后会继续恢复任务。');
    } finally {
      if (activePollingJobRef.current?.controller === controller) {
        activePollingJobRef.current = null;
        if (pageIsMountedRef.current) setIsLoading(false);
      }
    }
  }, [clearActiveJob, router]);

  useEffect(() => {
    pageIsMountedRef.current = true;
    return () => {
      pageIsMountedRef.current = false;
      activePollingJobRef.current?.controller.abort();
      activePollingJobRef.current = null;
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

  const handleAnalyze = async (data: AuditSubmitData) => {
    if (submitting.current) return;
    submitting.current = true;
    setIsLoading(true);
    setError(null);
    setLastSubmittedData(data);
    clearActiveJob();
    if (pendingSubmission.current?.input !== data) pendingSubmission.current = { input: data, requestId: crypto.randomUUID() };

    try {
      const response = await fetch('/api/analyze/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clientRequestId: pendingSubmission.current.requestId }),
      });

      const resData = await response.json();

      if (!response.ok) {
        if (response.status < 500) pendingSubmission.current = null;
        throw new Error(resData.error || `请求失败 (${response.status})`);
      }

      const jobId = resData.jobId;
      if (!jobId) throw new Error('服务端未返回审视任务 ID。');
      pendingSubmission.current = null;
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
      <div id="main-content" tabIndex={-1} className="workspace-container">
        <div className="space-y-5">
            <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} />
            {isLoading && <div ref={progressPanel} className="scroll-mt-24">{lastSubmittedData?.title&&<p className="mb-3 text-base font-semibold">{lastSubmittedData.title}</p>}<LoadingState /></div>}
            {activeJobId && !isLoading && <p role="status" className="text-sm text-[var(--color-text-muted)]">{t('home.backgroundJob')}</p>}
            {error && <div ref={errorPanel} tabIndex={-1} className="scroll-mt-24"><ErrorMessage message={error} onRetry={handleRetry} /></div>}
        </div>
        <p className="news-public-link"><Link href="/audits">{language.startsWith('zh')?'公开审读 · 浏览报告':'Public reviews · Browse reports'}<ArrowRight size={18} strokeWidth={1.75} aria-hidden="true"/></Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}

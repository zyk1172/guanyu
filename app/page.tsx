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
import { AnalysisResult, AnalysisMode, getThinkingDepthLabel } from '../lib/types';

interface HotAudit {
  id: string;
  title: string;
  source: string;
  newsSummary: string;
  modelName: string;
  reasoningDepth: string;
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
}

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<AuditSubmitData | null>(null);
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

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || `请求失败 (${response.status})`);
      }

      if (resData.auditId) {
        router.push(`/audits/${resData.auditId}`);
        return;
      }

      setResult(resData.result);
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

  const getDepthLabel = getThinkingDepthLabel;

  return (
    <main className="relative min-h-screen overflow-hidden bg-gray-50 dark:bg-black font-sans leading-normal tracking-normal text-gray-900 dark:text-gray-100 selection:bg-indigo-500/20">
      <div data-gsap-drift className="ambient-glow pointer-events-none absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-700/10" />
      <div data-gsap-drift className="ambient-glow pointer-events-none absolute right-[-6rem] top-72 h-60 w-60 rounded-full bg-sky-200/30 blur-3xl dark:bg-sky-700/10" />

      <Header />

      {/* 主体内容 */}
      <GsapReveal className="relative z-10 max-w-6xl mx-auto px-3 sm:px-4 py-4 md:py-6 space-y-4">
        {/* Slogan */}
        <div data-gsap-reveal className="flex flex-col gap-2 border-b border-gray-100 pb-3 dark:border-gray-900 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
              观隅
            </h1>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
              看见新闻没有展开的一角
            </p>
            <p className="max-w-3xl text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-normal">
              本工具用来结构化拆解新闻的表层叙事、语言引导、缺席视角、利益纠葛和证据链盲区。我们不编造阴谋论，我们只帮你寻找值得验证的盲区与合理解释。
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
            核验不确定性说明：涉及推断的内容需结合更多来源验证，不应直接视为事实。
          </div>
        </div>

        {/* 表单与分析区 */}
        <div data-gsap-reveal className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="space-y-4">
            <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} />
            {isLoading && <LoadingState />}
            {error && <ErrorMessage message={error} onRetry={handleRetry} />}
            {result && !isLoading && !error && (
              <div data-gsap-reveal className="border-t border-gray-100 dark:border-gray-900 pt-5">
                <div className="text-center mb-5">
                  <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 rounded-full text-xs font-semibold tracking-wider uppercase mb-2">
                    REVIEW REPORT
                  </span>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">叙事反向审视报告</h3>
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
          </div>

          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <section className="animated-panel rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-900">
                <h2 className="text-sm font-black text-gray-950 dark:text-white">热门审视</h2>
                <span className="text-xxs font-bold text-gray-400">按点击热度排序</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                展示用户公开分享的历史审视结果，按照点击热度排序。
              </p>
              <div className="mt-3 space-y-3">
                {isLoadingHotAudits ? (
                  <div className="py-8 text-center text-xs font-semibold text-gray-400">正在加载热门审视...</div>
                ) : hotAudits.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-xs text-gray-400 dark:border-gray-800">
                    暂无公开审视记录。
                  </div>
                ) : (
                  hotAudits.slice(0, 6).map((audit) => (
                    <article key={audit.id} className="interactive-lift rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900/60">
                      <div className="flex flex-wrap items-center gap-1.5 text-xxs font-bold text-gray-400">
                        <span>{audit.source || '未知来源'}</span>
                        <span>·</span>
                        <span>{new Date(audit.createdAt).toLocaleDateString()}</span>
                        <span>·</span>
                        <span>{audit.viewCount} 次点击</span>
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-gray-950 dark:text-white">{audit.title}</h3>
                      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {audit.newsSummary}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xxs font-bold">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">{audit.modelName}</span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{getDepthLabel(audit.reasoningDepth)}</span>
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">可信度 {audit.credibilityScore}</span>
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">推测不确定性 {audit.speculationRiskScore}</span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Link href={`/audits/${audit.id}`} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700">
                          查看详情
                        </Link>
                      </div>
                    </article>
                  ))
                )}
              </div>
              {hotAudits.length > 0 && (
                <Link href="/audits" className="mt-3 block rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
                  展开更多
                </Link>
              )}
            </section>

            <section className="rounded-xl border border-gray-100 bg-white p-4 text-xs leading-relaxed text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
              <h2 className="text-sm font-black text-gray-950 dark:text-white">高频使用说明</h2>
              <ul className="mt-2 space-y-1.5">
                <li>1. 默认大模型、思考深度和公开偏好在账号管理中设置。</li>
                <li>2. 每次审视会保存新闻总结、评分、图表数据和完整 JSON。</li>
                <li>3. 公开记录会进入热门审视；私有记录仅自己可见。</li>
              </ul>
            </section>
          </aside>
        </div>
      </GsapReveal>

      {/* 极简页脚 */}
      <footer className="relative z-10 border-t border-gray-100 dark:border-gray-900 bg-white dark:bg-gray-950 py-8 mt-16 text-center text-xs text-gray-400 dark:text-gray-500">
        <div className="max-w-6xl mx-auto px-4 space-y-2 font-medium">
          <p>© 2026 观隅. 保留所有权利。</p>
          <p className="text-xxs">声明：本分析由大语言模型驱动，其输出的替代解释和盲区梳理仅作为批判性思考和事实核查之线索，并不代表本系统立场，亦不代表已核实之事实。</p>
        </div>
      </footer>
    </main>
  );
}

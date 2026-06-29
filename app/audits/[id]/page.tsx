'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Header from '@/components/Header';
import AnalysisResultView from '@/components/AnalysisResult';
import ErrorMessage from '@/components/ErrorMessage';
import { getThinkingDepthLabel } from '@/lib/types';

export default function AuditDetailsPage() {
  const params = useParams();
  const auditId = typeof params?.id === 'string' ? params.id : null;
  const { data: session } = useSession();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditRecord, setAuditRecord] = useState<any | null>(null);
  const [isAuthor, setIsAuthor] = useState(false);
  const [isOriginalOpen, setIsOriginalOpen] = useState(false);

  const fetchAuditDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!auditId) {
        setError('审视记录 ID 无效。');
        return;
      }

      const res = await fetch(`/api/audits/${auditId}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError('你没有权限查看这条审视记录。');
        } else if (res.status === 404) {
          setError('未找到该审视记录。');
        } else {
          setError(data.error || '获取审视详情失败。');
        }
        return;
      }

      setAuditRecord(data);
      
      // 判断当前用户是否是这条审视的创建者
      if (session?.user && data.userId === (session.user as any).id) {
        setIsAuthor(true);
      }
    } catch (err) {
      console.error(err);
      setError('无法连接到服务器，请重试。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (auditId) {
      fetchAuditDetails();
    }
  }, [auditId, session]);

  const togglePublic = async () => {
    if (!auditRecord) return;
    try {
      const res = await fetch(`/api/audits/${auditRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !auditRecord.isPublic }),
      });
      if (res.ok) {
        setAuditRecord({ ...auditRecord, isPublic: !auditRecord.isPublic });
      }
    } catch (err) {
      console.error('更新公开状态失败:', err);
    }
  };

  const getDepthLabel = getThinkingDepthLabel;

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'quick': return '快速分析';
      case 'deep': return '深度分析';
      default: return mode;
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-black font-sans">
        <Header />
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-16 text-center space-y-3">
          <div className="animate-spin h-6 w-6 text-indigo-600 mx-auto border-2 border-indigo-600 border-t-transparent rounded-full" />
          <p className="text-xs font-semibold text-gray-400">正在获取结构化审视报告，并更新历史热度权重...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-black font-sans">
        <Header />
        <div className="max-w-xl mx-auto px-3 sm:px-4 py-10">
          <ErrorMessage message={error} />
          <div className="text-center pt-4">
            <Link href="/" className="text-xs font-bold text-indigo-600 hover:underline">
              ← 返回系统首页公开热门审视
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 反序列化大模型生成的结构化结果 JSON
  let auditResultParsed = null;
  try {
    auditResultParsed = JSON.parse(auditRecord.auditResultJson);
  } catch (e) {
    console.error('反序列化审视结果 JSON 失败:', e);
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans text-gray-900 dark:text-gray-100 selection:bg-indigo-500/20 pb-16">
      <Header />

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">
        {/* A. 详情页极简元信息顶栏 */}
        <div className="bg-white dark:bg-gray-950 p-3 sm:p-4 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xxs font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded tracking-wide uppercase">
                思考强度 {getDepthLabel(auditRecord.reasoningDepth)}
              </span>
              <span className="text-xxs font-bold bg-gray-150 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded tracking-wide uppercase">
                {getModeLabel(auditRecord.analysisMode)}
              </span>
              <span className="text-xxs text-gray-400 dark:text-gray-500 font-semibold">
                信源: {auditRecord.source} · {new Date(auditRecord.createdAt).toLocaleString()}
              </span>
            </div>
            <h2 className="break-words text-sm md:text-base font-bold text-gray-950 dark:text-white leading-snug">
              {auditRecord.title}
            </h2>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 text-xs font-bold md:w-auto md:justify-end">
            {isAuthor && (
              <button
                onClick={togglePublic}
                className={`px-3 py-1.5 rounded-lg border text-xxs font-black transition ${
                  auditRecord.isPublic
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 text-gray-500'
                }`}
              >
                {auditRecord.isPublic ? '🟢 公开展示中' : '🔒 仅自己可见'}
              </button>
            )}
            <span className="text-xxs text-gray-400 font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 px-2 py-1.5 rounded-lg">
              🔥 {auditRecord.viewCount} 次浏览
            </span>
          </div>
        </div>

        {auditRecord.originalContent && (
          <section className="rounded-xl border border-gray-150 bg-white p-3 shadow-sm dark:border-gray-900 dark:bg-gray-950 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-950 dark:text-white">新闻原文</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  默认折叠，只在需要核对模型引用和原文上下文时展开。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOriginalOpen((value) => !value)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 active:scale-[0.98] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-850"
                aria-expanded={isOriginalOpen}
              >
                {isOriginalOpen ? '收起原文' : '查看原文'}
              </button>
            </div>
            {isOriginalOpen && (
              <div className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
                <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-gray-700 dark:text-gray-300">
                  {auditRecord.originalContent}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* B. 核心审视度量指标卡片 & 完整博弈详情面板 */}
        {auditResultParsed ? (
          <div className="space-y-4 sm:space-y-5">
            {/* 注入 auditId 属性以激活动态 Q&A 提问中枢 */}
            <AnalysisResultView
              result={auditResultParsed}
              auditId={auditRecord.id}
              originalContent={auditRecord.originalContent}
              auditMeta={{
                title: auditRecord.title,
                source: auditRecord.source,
                publishedAt: auditRecord.publishedAt,
                modelName: auditRecord.modelName,
                reasoningDepth: getDepthLabel(auditRecord.reasoningDepth),
                analysisMode: getModeLabel(auditRecord.analysisMode),
                createdAt: new Date(auditRecord.createdAt).toLocaleString(),
                viewCount: auditRecord.viewCount,
                isPublic: auditRecord.isPublic,
              }}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm text-center text-xs text-gray-400 font-semibold">
            ⚠️ 警告：该条记录的审视 JSON 文件损坏，无法提取博弈多方度量详情。
          </div>
        )}

        {/* C. 底部快速交互返回栏 */}
        <div className="flex flex-col justify-between gap-2 pt-2 sm:flex-row sm:items-center">
          <Link
            href="/"
            className="px-4 py-2 border border-gray-200 dark:border-gray-850 hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold transition flex items-center gap-1"
          >
            ← 返回系统首页公开热门审视
          </Link>
          {isAuthor && (
            <Link
              href="/my-audits"
              className="px-4 py-2 bg-indigo-550 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm transition"
            >
              管理我的全部记录
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

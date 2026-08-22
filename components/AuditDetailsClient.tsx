'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import AnalysisResultView from '@/components/AnalysisResult';
import { getReportLanguageLabel, getThinkingDepthLabel } from '@/lib/types';
import { useUiLanguage } from '@/components/LanguageProvider';
import ReanalyzeControl from '@/components/ReanalyzeControl';

interface AuditDetailsClientProps {
  auditRecord: any;
  canManage: boolean;
  isAuthor: boolean;
}

export default function AuditDetailsClient({ auditRecord: initialAuditRecord, canManage, isAuthor }: AuditDetailsClientProps) {
  const { language, t } = useUiLanguage();
  const [auditRecord, setAuditRecord] = useState(initialAuditRecord);

  const getDepthLabel = (depth: string) => getThinkingDepthLabel(depth, language);
  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'quick': return language === 'en-US' ? 'Legacy quick analysis' : '历史快速分析';
      case 'deep': return language === 'en-US' ? 'Guanyu analysis' : '观隅分析';
      default: return mode;
    }
  };

  const togglePublic = async () => {
    try {
      const response = await fetch(`/api/audits/${auditRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !auditRecord.isPublic }),
      });
      if (response.ok) setAuditRecord({ ...auditRecord, isPublic: !auditRecord.isPublic });
    } catch (error) {
      console.error('更新公开状态失败:', error);
    }
  };

  let auditResultParsed = null;
  try {
    auditResultParsed = JSON.parse(auditRecord.auditResultJson);
  } catch (error) {
    console.error('反序列化审视结果 JSON 失败:', error);
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans text-gray-900 dark:text-gray-100 selection:bg-indigo-500/20 pb-16">
      <Header />
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">
        <div className="bg-white dark:bg-gray-950 p-3 sm:p-4 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xxs font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded tracking-wide uppercase">
                {t('audit.thinking', undefined, { depth: getDepthLabel(auditRecord.reasoningDepth) })}
              </span>
              <span className="text-xxs font-bold bg-gray-150 dark:bg-gray-900 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded tracking-wide uppercase">
                {getModeLabel(auditRecord.analysisMode)}
              </span>
              <span className="text-xxs font-bold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded tracking-wide">
                {getReportLanguageLabel(auditRecord.reportLanguage, language)}
              </span>
              <span className="text-xxs text-gray-400 dark:text-gray-500 font-semibold">
                {t('audit.source')}: {auditRecord.source} · {new Date(auditRecord.createdAt).toLocaleString(language)}
              </span>
            </div>
            <h2 className="break-words text-sm md:text-base font-bold text-gray-950 dark:text-white leading-snug">{auditRecord.title}</h2>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-xs font-bold md:w-auto md:justify-end">
            {isAuthor && (
              <button onClick={togglePublic} className={`px-3 py-1.5 rounded-lg border text-xxs font-black transition ${auditRecord.isPublic ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 text-gray-500'}`}>
                {auditRecord.isPublic ? `🟢 ${t('audit.public')}` : `🔒 ${t('audit.private')}`}
              </button>
            )}
            <span className="text-xxs text-gray-400 font-semibold bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 px-2 py-1.5 rounded-lg">🔥 {t('audit.views', undefined, { count: auditRecord.viewCount })}</span>
          </div>
        </div>

        {isAuthor && <ReanalyzeControl auditId={auditRecord.id} />}
        {auditResultParsed ? (
          <div className="space-y-4 sm:space-y-5">
            <AnalysisResultView
              result={auditResultParsed}
              auditId={auditRecord.id}
              originalContent={auditRecord.originalContent}
              auditMeta={{
                title: auditRecord.title,
                source: auditRecord.source,
                publishedAt: auditRecord.publishedAt,
                publishedAtSource: auditRecord.publishedAtSource,
                publishedAtConfidence: auditRecord.publishedAtConfidence,
                modelName: auditRecord.modelName,
                reasoningDepth: getDepthLabel(auditRecord.reasoningDepth),
                analysisMode: getModeLabel(auditRecord.analysisMode),
                reportLanguage: auditRecord.reportLanguage,
                createdAt: new Date(auditRecord.createdAt).toLocaleString(),
                viewCount: auditRecord.viewCount,
                isPublic: auditRecord.isPublic,
              }}
              canUpdateVerification={canManage}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm text-center text-xs text-gray-400 font-semibold">⚠️ 警告：该条记录的审视 JSON 文件损坏，无法提取博弈多方度量详情。</div>
        )}

        <div className="flex flex-col justify-between gap-2 pt-2 sm:flex-row sm:items-center">
          <Link href="/" className="px-4 py-2 border border-gray-200 dark:border-gray-850 hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold transition flex items-center gap-1">← {t('audit.backHome')}</Link>
          {isAuthor && <Link href="/my-audits" className="px-4 py-2 bg-indigo-550 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm transition">{t('audit.manageRecords')}</Link>}
        </div>
      </div>
    </main>
  );
}

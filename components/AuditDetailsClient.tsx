'use client';

import AnalysisResultView from '@/components/AnalysisResult';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import ReanalyzeControl from '@/components/ReanalyzeControl';
import RelatedCoverage from '@/components/RelatedCoverage';
import { Button, ButtonLink, Panel } from '@/components/ui/controls';
import { getReportLanguageLabel, getThinkingDepthLabel } from '@/lib/types';
import { useState, useSyncExternalStore } from 'react';

// Use a stable timezone during hydration, then display the reader's local time.
const subscribeToTimezone = () => () => {};
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimezone = () => 'UTC';

interface AuditDetailsClientProps {
  auditRecord: any;
  canManage: boolean;
  isAuthor: boolean;
  isOwner?: boolean;
}

export default function AuditDetailsClient({ auditRecord: initialAuditRecord, canManage, isAuthor, isOwner = false }: AuditDetailsClientProps) {
  const { language, t } = useUiLanguage();
  const [auditRecord, setAuditRecord] = useState(initialAuditRecord);
  const timeZone = useSyncExternalStore(subscribeToTimezone, browserTimezone, serverTimezone);
  const createdAtText = new Date(auditRecord.createdAt).toLocaleString(language, { timeZone, timeZoneName: 'short' });

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
    <main className="workspace-page">
      <Header />
      <div id="main-content" tabIndex={-1} className="reading-container space-y-5">
        <div className="reading-heading flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)] tracking-wide uppercase">
                {t('audit.thinking', undefined, { depth: getDepthLabel(auditRecord.reasoningDepth) })}
              </span>
              <span className="ui-badge bg-[var(--color-surface)] text-[var(--color-text-muted)] tracking-wide uppercase">
                {getModeLabel(auditRecord.analysisMode)}
              </span>
              <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)] tracking-wide">
                {getReportLanguageLabel(auditRecord.reportLanguage, language)}
              </span>
              <span className="text-xxs text-[var(--color-text-subtle)] font-semibold">
                {t('audit.source')}: {auditRecord.source} · {createdAtText}
              </span>
            </div>
            <h1 className="break-words">{auditRecord.title}</h1>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-xs font-bold md:w-auto md:justify-end">
            {isAuthor && (
              <Button variant="secondary" aria-pressed={auditRecord.isPublic} onClick={togglePublic}>
                {auditRecord.isPublic ? `🟢 ${t('audit.public')}` : `🔒 ${t('audit.private')}`}
              </Button>
            )}
            <span className="ui-badge text-[var(--color-text-subtle)] bg-[var(--color-surface-muted)] border border-[var(--color-border)]">🔥 {t('audit.views', undefined, { count: auditRecord.viewCount })}</span>
          </div>
        </div>

        {isAuthor && <ReanalyzeControl auditId={auditRecord.id} />}
        {auditResultParsed ? (
          <div className="space-y-4 sm:space-y-5">
            <AnalysisResultView
              relatedCoverage={isOwner ? <RelatedCoverage auditId={auditRecord.id} /> : undefined}
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
                createdAt: createdAtText,
                viewCount: auditRecord.viewCount,
                isPublic: auditRecord.isPublic,
              }}
              canUpdateVerification={canManage}
           />
          </div>
        ) : (
          <Panel as="div" className="text-center text-xs text-[var(--color-text-subtle)] font-semibold">{language.startsWith('zh-') ? '报告暂时无法显示，请刷新重试。若问题持续，请重新分析原文。' : 'This report could not be displayed. Refresh the page or analyze the original article again.'}</Panel>
        )}

        <div className="flex flex-col justify-between gap-2 pt-2 sm:flex-row sm:items-center">
          <ButtonLink variant="secondary" href="/">← {t('audit.backHome')}</ButtonLink>
          {isAuthor && <ButtonLink variant="primary" href="/my-audits">{t('audit.manageRecords')}</ButtonLink>}
        </div>
      </div>
    </main>
  );
}

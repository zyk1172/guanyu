'use client';

import { useState } from 'react';
import { PlatformModelSelector, type ModelSourceSelection } from '@/components/PlatformModelSelector';
import { useUiLanguage } from '@/components/LanguageProvider';
import { ACTIVE_ANALYSIS_JOB_STORAGE_KEY } from '@/lib/analysis-job-client-core.mjs';

export default function ReanalyzeControl({ auditId }: { auditId: string }) {
  const { t } = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<ModelSourceSelection>('platform');
  const [modelId, setModelId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('3');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelSource: source, platformModelConfigId: source === 'platform' ? modelId : undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.jobId) throw new Error(data.error || t('reanalyze.failed', '无法创建重新分析任务。'));
      window.sessionStorage.setItem(ACTIVE_ANALYSIS_JOB_STORAGE_KEY, String(data.jobId));
      window.location.assign('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('reanalyze.failed', '无法创建重新分析任务。'));
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-[var(--color-text)]">{t('reanalyze.title', '重新分析')}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t('reanalyze.description', '保留当前报告，使用所选模型生成一份新的独立报告。')}</p>
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() => open ? void submit() : setOpen(true)}
          className="rounded-[var(--radius-button)] bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {submitting
            ? t('reanalyze.submitting', '正在创建任务…')
            : open
              ? `${t('reanalyze.confirm', '确认重新分析')} · ${source === 'custom' ? '0' : estimatedCost} ${t('modelSelector.credits', '点')}`
              : t('reanalyze.title', '重新分析')}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <PlatformModelSelector
            operation="analysis"
            source={source}
            onSourceChange={setSource}
            selectedId={modelId}
            onSelectedIdChange={setModelId}
            onEstimatedCostChange={(cost) => setEstimatedCost(cost)}
          />
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {source === 'custom'
              ? t('modelSelector.customCharge', '本次使用自定义 API，不消耗平台点数。')
              : t('modelSelector.estimatedCharge', '预计消耗 {credits} 点；仅在任务成功后扣除。', { credits: estimatedCost })}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-bold text-[var(--color-danger)]">{error}</p>}
    </section>
  );
}

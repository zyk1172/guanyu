'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUiLanguage } from '@/components/LanguageProvider';
import { effectivePlatformModelId } from '@/lib/platform-model-core.mjs';

export type ModelOperation = 'analysis' | 'completion' | 'followup';
export type ModelSourceSelection = 'platform' | 'custom';

type ModelItem = {
  id: string;
  displayName: string;
  description: string;
  provider: string;
  searchMode: 'platform' | 'native' | 'none';
  supportsWebSearch: boolean;
  contentOnlyAnalysis: boolean;
  recommended: boolean;
  isDefault: boolean;
  isUserDefault: boolean;
  estimatedCostCents: number;
  estimatedCost: string;
};

export function PlatformModelSelector({
  operation,
  source,
  onSourceChange,
  selectedId,
  onSelectedIdChange,
  onEstimatedCostChange,
  compact = false,
  allowCustomOverride = false,
}: {
  operation: ModelOperation;
  source: ModelSourceSelection;
  onSourceChange: (source: ModelSourceSelection) => void;
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  onEstimatedCostChange?: (cost: string, cents: number) => void;
  compact?: boolean;
  allowCustomOverride?: boolean;
}) {
  const { language, t } = useUiLanguage();
  const [models, setModels] = useState<ModelItem[]>([]);
  const [customAvailable, setCustomAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/platform-models?operation=${operation}&locale=${encodeURIComponent(language)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || t('modelSelector.loadFailed', '无法加载平台模型。'));
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const nextModels = Array.isArray(data.models) ? data.models : [];
        setModels(nextModels);
        setCustomAvailable(Boolean(data.customAvailable));
        const nextId = effectivePlatformModelId(nextModels, selectedId);
        if (nextId !== selectedId) onSelectedIdChange(nextId);
        if (data.modelSource === 'custom' && data.customAvailable && source !== 'custom') onSourceChange('custom');
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : t('modelSelector.loadFailed', '无法加载平台模型。'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [language, operation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading || !models.length) return;
    const effectiveId = effectivePlatformModelId(models, selectedId);
    if (effectiveId && effectiveId !== selectedId) onSelectedIdChange(effectiveId);
  }, [loading, models, selectedId, onSelectedIdChange]);

  const selected = useMemo(() => models.find((item) => item.id === selectedId) || models[0] || null, [models, selectedId]);
  useEffect(() => {
    const cents = source === 'custom' ? 0 : selected?.estimatedCostCents || 0;
    onEstimatedCostChange?.(source === 'custom' ? '0' : selected?.estimatedCost || '0', cents);
  }, [source, selected, onEstimatedCostChange]);

  const customAllowed = customAvailable || allowCustomOverride;

  return (
    <div className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] ${compact ? 'p-2' : 'p-3'}`} data-model-selector={operation}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black text-[var(--color-text)]">{t('modelSelector.activeTitle', '当前激活模型')}</span>
        <div className="inline-flex rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[var(--color-input-bg)] p-0.5">
          <button
            type="button"
            onClick={() => onSourceChange('platform')}
            className={`rounded-[calc(var(--radius-button)-2px)] px-2.5 py-1 text-xs font-bold transition ${source === 'platform' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            {t('modelSelector.platform', '平台模型')}
          </button>
          <button
            type="button"
            disabled={!customAllowed}
            onClick={() => customAllowed && onSourceChange('custom')}
            className={`rounded-[calc(var(--radius-button)-2px)] px-2.5 py-1 text-xs font-bold transition ${source === 'custom' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'} disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {t('modelSelector.custom', '自定义 API')}
          </button>
        </div>
      </div>

      {source === 'platform' ? (
        <div className="mt-2">
          <select
            value={selected?.id || ''}
            disabled={loading || !models.length}
            onChange={(event) => onSelectedIdChange(event.target.value)}
            className="w-full rounded-[var(--radius-button)] border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}{model.recommended ? ` · ${t('modelSelector.recommended', '推荐')}` : ''} · {model.estimatedCost} {t('modelSelector.credits', '点')}
              </option>
            ))}
          </select>
          {selected && !compact && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              {selected.description && <span className="mr-1">{selected.description}</span>}
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">{selected.estimatedCost} {t('modelSelector.credits', '点')}</span>
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5">
                {selected.searchMode === 'native'
                  ? t('modelSelector.nativeSearch', '模型原生联网')
                  : selected.searchMode === 'platform'
                    ? t('modelSelector.platformSearch', '平台联网核验')
                    : t('modelSelector.noSearch', '不联网')}
              </span>
              {selected.contentOnlyAnalysis && (
                <span className="rounded-full border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 px-2 py-0.5 text-[var(--color-warning)]">
                  {t('modelSelector.contentOnly', '仅基于已有内容分析')}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {t('modelSelector.customHint', '使用你保存的模型 API；模型操作不消耗平台点数，第三方费用由服务商收取。')}
        </p>
      )}

      {!customAllowed && source !== 'custom' && !compact && (
        <p className="mt-2 text-[11px] text-[var(--color-text-subtle)]">{t('modelSelector.customUnavailable', '有效 Pro 权益并完成自定义 API 配置后可选择自定义 API。')}</p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

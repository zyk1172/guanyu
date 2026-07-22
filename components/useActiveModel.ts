'use client';

import { useEffect, useState } from 'react';
import { useUiLanguage } from '@/components/LanguageProvider';
import type { ModelOperation, ModelSourceSelection } from '@/components/PlatformModelSelector';

type ActiveModelState = {
  source: ModelSourceSelection;
  displayName: string;
  estimatedCost: string;
  estimatedCostCents: number;
  loading: boolean;
  error: string;
};

const BASE_COST: Record<ModelOperation, string> = { analysis: '3', completion: '2', followup: '1' };

export function useActiveModel(operation: ModelOperation): ActiveModelState {
  const { language, t } = useUiLanguage();
  const [state, setState] = useState<ActiveModelState>({
    source: 'platform',
    displayName: '',
    estimatedCost: BASE_COST[operation],
    estimatedCostCents: Number(BASE_COST[operation]) * 100,
    loading: true,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: '' }));
    fetch(`/api/platform-models?operation=${operation}&locale=${encodeURIComponent(language)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || t('modelSelector.loadFailed', '无法加载当前模型。'));
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const models = Array.isArray(data.models) ? data.models : [];
        const selected = models.find((item: any) => item.id === data.defaultPlatformModelConfigId)
          || models.find((item: any) => item.isUserDefault)
          || models.find((item: any) => item.isDefault)
          || models[0];
        const source: ModelSourceSelection = data.modelSource === 'custom' && data.customAvailable ? 'custom' : 'platform';
        setState({
          source,
          displayName: source === 'custom' ? t('modelSelector.custom', '自定义 API') : String(selected?.displayName || ''),
          estimatedCost: source === 'custom' ? '0' : String(selected?.estimatedCost || BASE_COST[operation]),
          estimatedCostCents: source === 'custom' ? 0 : Number(selected?.estimatedCostCents || Number(BASE_COST[operation]) * 100),
          loading: false,
          error: '',
        });
      })
      .catch((error) => {
        if (!cancelled) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : t('modelSelector.loadFailed', '无法加载当前模型。') }));
      });
    return () => { cancelled = true; };
  }, [language, operation, t]);

  return state;
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUiLanguage } from '@/components/LanguageProvider';

const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'it-IT'] as const;

type AdminModel = {
  id: string;
  provider: string;
  displayName: string;
  description: string;
  displayNameI18nJson: string;
  descriptionI18nJson: string;
  baseUrl: string;
  modelId: string;
  reasoningDepth: string;
  searchMode: string;
  supportsAnalysis: boolean;
  supportsCompletion: boolean;
  supportsFollowup: boolean;
  creditMultiplierBps: number;
  inputPriceMicrosPerMillion: number;
  outputPriceMicrosPerMillion: number;
  nativeSearchPriceMicrosPerRequest: number;
  isEnabled: boolean;
  isVisibleToUsers: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  sortOrder: number;
  configVersion: number;
  hasApiKey: boolean;
  lastTestStatus?: string | null;
  lastTestMessage?: string | null;
  lastTestedAt?: string | null;
};

type UsageGroup = {
  platformModelConfigIdSnapshot: string | null;
  operation: string;
  status: string;
  _count: { _all: number };
  _sum: { creditCostCents: number | null; inputTokens: number | null; outputTokens: number | null; searchRequestCount: number | null; nativeSearchRequestCount: number | null; estimatedExternalCostMicros: number | null; durationMs: number | null };
};

type Draft = {
  id: string;
  provider: string;
  displayName: string;
  description: string;
  displayNameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  reasoningDepth: string;
  searchMode: string;
  supportsAnalysis: boolean;
  supportsCompletion: boolean;
  supportsFollowup: boolean;
  creditMultiplier: string;
  inputPriceMicrosPerMillion: string;
  outputPriceMicrosPerMillion: string;
  nativeSearchPriceMicrosPerRequest: string;
  isEnabled: boolean;
  isVisibleToUsers: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  sortOrder: string;
};

const EMPTY: Draft = {
  id: '', provider: 'openai_compatible', displayName: '', description: '', displayNameI18n: {}, descriptionI18n: {}, baseUrl: 'https://api.deepseek.com', apiKey: '', modelId: '', reasoningDepth: 'medium', searchMode: 'platform', supportsAnalysis: true, supportsCompletion: true, supportsFollowup: true, creditMultiplier: '1', inputPriceMicrosPerMillion: '0', outputPriceMicrosPerMillion: '0', nativeSearchPriceMicrosPerRequest: '0', isEnabled: true, isVisibleToUsers: true, isRecommended: false, isDefault: false, sortOrder: '0',
};

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; modelId: string; searchMode: string }> = {
  openai_compatible: { baseUrl: 'https://api.deepseek.com', modelId: '', searchMode: 'platform' },
  openai: { baseUrl: 'https://api.openai.com/v1', modelId: 'gpt-5.4', searchMode: 'native' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', modelId: 'gemini-3.1-pro-preview', searchMode: 'native' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', modelId: 'claude-sonnet-4', searchMode: 'native' },
  xiaomi_mimo: { baseUrl: 'https://api.xiaomimimo.com/v1', modelId: 'mimo-v2.5-pro', searchMode: 'native' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', modelId: 'qwen-plus', searchMode: 'native' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', modelId: 'kimi-k3', searchMode: 'native' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'glm-5', searchMode: 'native' },
};

function parseMap(value: string) {
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

function toDraft(model: AdminModel): Draft {
  return {
    id: model.id,
    provider: model.provider,
    displayName: model.displayName,
    description: model.description,
    displayNameI18n: parseMap(model.displayNameI18nJson),
    descriptionI18n: parseMap(model.descriptionI18nJson),
    baseUrl: model.baseUrl,
    apiKey: '',
    modelId: model.modelId,
    reasoningDepth: model.reasoningDepth,
    searchMode: model.searchMode,
    supportsAnalysis: model.supportsAnalysis,
    supportsCompletion: model.supportsCompletion,
    supportsFollowup: model.supportsFollowup,
    creditMultiplier: String(model.creditMultiplierBps / 100),
    inputPriceMicrosPerMillion: String(model.inputPriceMicrosPerMillion),
    outputPriceMicrosPerMillion: String(model.outputPriceMicrosPerMillion),
    nativeSearchPriceMicrosPerRequest: String(model.nativeSearchPriceMicrosPerRequest),
    isEnabled: model.isEnabled,
    isVisibleToUsers: model.isVisibleToUsers,
    isRecommended: model.isRecommended,
    isDefault: model.isDefault,
    sortOrder: String(model.sortOrder),
  };
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block space-y-1 ${wide ? 'sm:col-span-2' : ''}`}><span className="text-xxs font-black text-[var(--color-text-muted)]">{label}</span>{children}</label>;
}

const inputClass = 'w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]';

export default function PlatformModelAdmin() {
  const { language, t } = useUiLanguage();
  const [models, setModels] = useState<AdminModel[]>([]);
  const [usage, setUsage] = useState<UsageGroup[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setBusy('load'); setMessage('');
    try {
      const response = await fetch('/api/admin/platform-models', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('platformAdmin.loadFailed', '平台模型加载失败。'));
      setModels(data.models || []); setUsage(data.usage || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : t('platformAdmin.loadFailed', '平台模型加载失败。')); }
    finally { setBusy(''); }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const usageByModel = useMemo(() => Object.fromEntries(models.map((model) => {
    const rows = usage.filter((row) => row.platformModelConfigIdSnapshot === model.id);
    return [model.id, {
      success: rows.filter((row) => row.status === 'success').reduce((sum, row) => sum + row._count._all, 0),
      failed: rows.filter((row) => row.status !== 'success').reduce((sum, row) => sum + row._count._all, 0),
      credits: rows.reduce((sum, row) => sum + (row._sum.creditCostCents || 0), 0) / 100,
      searches: rows.reduce((sum, row) => sum + (row._sum.searchRequestCount || 0) + (row._sum.nativeSearchRequestCount || 0), 0),
      externalUsd: rows.reduce((sum, row) => sum + (row._sum.estimatedExternalCostMicros || 0), 0) / 1_000_000,
    }];
  })), [models, usage]);

  const submit = async () => {
    setBusy('save'); setMessage('');
    try {
      const response = await fetch('/api/admin/platform-models', {
        method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, displayNameI18n: draft.displayNameI18n, descriptionI18n: draft.descriptionI18n }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('platformAdmin.saveFailed', '保存失败。'));
      setMessage(t('platformAdmin.saved', '平台模型配置已保存。')); setDraft(EMPTY); setExpanded(false); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : t('platformAdmin.saveFailed', '保存失败。')); }
    finally { setBusy(''); }
  };

  const action = async (model: AdminModel, actionName: 'test' | 'setDefault' | 'delete') => {
    setBusy(`${actionName}:${model.id}`); setMessage('');
    try {
      const response = await fetch(actionName === 'delete' ? `/api/admin/platform-models?id=${encodeURIComponent(model.id)}` : '/api/admin/platform-models', {
        method: actionName === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(actionName === 'delete' ? {} : { body: JSON.stringify({ id: model.id, action: actionName }) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('platformAdmin.actionFailed', '操作失败。'));
      setMessage(actionName === 'test' ? String(data.message || (data.passed ? t('platformAdmin.testPassed', '模型连接测试通过。') : t('platformAdmin.testFailed', '模型连接测试失败。'))) : t('platformAdmin.actionDone', '操作已完成。'));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : t('platformAdmin.actionFailed', '操作失败。')); }
    finally { setBusy(''); }
  };

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
        <div><h3 className="text-sm font-black text-[var(--color-text)]">{t('platformAdmin.title', '平台模型管理')}</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('platformAdmin.description', '集中配置用户可选模型、联网方式、思考强度、点数倍率及成本统计。')}</p></div>
        <button type="button" onClick={() => { setDraft(EMPTY); setExpanded(true); }} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white hover:bg-[var(--color-primary-hover)]">{t('platformAdmin.add', '新增模型')}</button>
      </div>

      {message && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs font-semibold text-[var(--color-text)]">{message}</p>}

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {models.map((model) => {
          const stat = usageByModel[model.id] || { success: 0, failed: 0, credits: 0, searches: 0, externalUsd: 0 };
          const testPassed = model.lastTestStatus === 'passed' || model.lastTestStatus === 'success';
          const testFailed = model.lastTestStatus === 'failed' || model.lastTestStatus === 'error';
          return <article key={model.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h4 className="truncate text-sm font-black text-[var(--color-text)]">{model.displayName}</h4>{model.isDefault && <span className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-xxs font-black text-[var(--color-success)]">{t('platformAdmin.default', '默认')}</span>}{model.isRecommended && <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-xxs font-black text-[var(--color-warning)]">{t('platformAdmin.recommended', '推荐')}</span>}</div><p className="mt-1 truncate font-mono text-xxs text-[var(--color-text-subtle)]">{model.provider} · {model.modelId} · v{model.configVersion}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-2 py-1 text-xxs font-black ${model.isEnabled ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}`}>{model.isEnabled ? t('platformAdmin.enabled', '启用') : t('platformAdmin.disabled', '停用')}</span><span className={`rounded-full px-2 py-1 text-xxs font-black ${testPassed ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : testFailed ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)]'}`}>{testPassed ? t('platformAdmin.testPassedShort', '测试通过') : testFailed ? t('platformAdmin.testFailedShort', '测试失败') : t('platformAdmin.notTested', '尚未测试')}</span></div></div>
            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xxs sm:grid-cols-6"><div className="rounded bg-[var(--color-surface-muted)] p-2"><b className="block text-[var(--color-text)]">{model.creditMultiplierBps / 100}x</b><span className="text-[var(--color-text-subtle)]">{t('platformAdmin.multiplier', '倍率')}</span></div><div className="rounded bg-[var(--color-surface-muted)] p-2"><b className="block text-[var(--color-text)]">{stat.success}</b><span className="text-[var(--color-text-subtle)]">{t('platformAdmin.successes', '成功')}</span></div><div className="rounded bg-[var(--color-surface-muted)] p-2"><b className="block text-[var(--color-text)]">{stat.failed}</b><span className="text-[var(--color-text-subtle)]">{t('platformAdmin.failures', '失败')}</span></div><div className="rounded bg-[var(--color-surface-muted)] p-2"><b className="block text-[var(--color-text)]">{Number.isInteger(stat.credits) ? stat.credits : stat.credits.toFixed(1)}</b><span className="text-[var(--color-text-subtle)]">{t('platformAdmin.creditsCharged', '扣点')}</span></div><div className="rounded bg-[var(--color-surface-muted)] p-2"><b className="block text-[var(--color-text)]">{stat.searches}</b><span className="text-[var(--color-text-subtle)]">{t('platformAdmin.searches', '搜索')}</span></div><div className="rounded bg-[var(--color-surface-muted)] p-2"><b className="block text-[var(--color-text)]">${stat.externalUsd.toFixed(3)}</b><span className="text-[var(--color-text-subtle)]">{t('platformAdmin.estimatedCost', '估算成本')}</span></div></div>
            <div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => { setDraft(toDraft(model)); setExpanded(true); }} className="rounded border border-[var(--color-border)] px-2 py-1 text-xxs font-black text-[var(--color-text)]">{t('platformAdmin.edit', '编辑')}</button><button type="button" disabled={Boolean(busy)} onClick={() => void action(model, 'test')} className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded border border-[var(--color-border)] px-2 py-1 text-xxs font-black text-[var(--color-link)] disabled:cursor-wait">{busy === `test:${model.id}` ? <><span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-r-transparent" />{t('platformAdmin.testing', '正在测试')}</> : t('platformAdmin.test', '完整测试')}</button>{!model.isDefault && <button type="button" onClick={() => void action(model, 'setDefault')} className="rounded border border-[var(--color-border)] px-2 py-1 text-xxs font-black text-[var(--color-success)]">{t('platformAdmin.setDefault', '设为默认')}</button>}{!model.isDefault && <button type="button" onClick={() => void action(model, 'delete')} className="rounded border border-[var(--color-danger)]/40 px-2 py-1 text-xxs font-black text-[var(--color-danger)]">{t('common.delete', '删除')}</button>}</div>
            {busy === `test:${model.id}` && <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"><span className="block h-full w-2/3 animate-pulse rounded-full bg-[var(--color-primary)]" /></div>}
            {model.lastTestedAt && <p className={`mt-2 rounded-lg border p-2 text-xxs font-semibold ${testPassed ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}`}>{model.lastTestMessage} · {new Date(model.lastTestedAt).toLocaleString(language)}</p>}
          </article>;
        })}
      </div>
      {!!models.length && <p className="mt-2 text-xxs leading-relaxed text-[var(--color-text-subtle)]">{t('platformAdmin.costScope', '成本为模型 Token 与模型原生搜索的估算值；平台 Tavily/Serper 搜索次数单独统计，不计入该金额。')}</p>}
      {!models.length && busy !== 'load' && <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">{t('platformAdmin.empty', '暂无平台模型。')}</p>}

      {expanded && <div className="mt-4 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-4">
        <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-black text-[var(--color-text)]">{draft.id ? t('platformAdmin.editTitle', '编辑平台模型') : t('platformAdmin.addTitle', '新增平台模型')}</h4><button type="button" onClick={() => setExpanded(false)} className="text-xs font-bold text-[var(--color-text-muted)]">{t('common.close', '关闭')}</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('platformAdmin.provider', '服务商')}><select className={inputClass} value={draft.provider} onChange={(e) => { const provider = e.target.value; const preset = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai_compatible; setDraft({ ...draft, provider, baseUrl: preset.baseUrl, modelId: draft.id ? draft.modelId : preset.modelId, searchMode: preset.searchMode }); }}><option value="openai_compatible">通用 OpenAI-compatible</option><option value="xiaomi_mimo">小米 MiMo（专用）</option><option value="qwen">阿里云千问 / Qwen（专用）</option><option value="moonshot">月之暗面 Kimi（专用）</option><option value="zhipu">智谱 GLM（专用）</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="anthropic">Claude / Anthropic</option></select></Field>
          <Field label={t('platformAdmin.displayName', '显示名称')}><input className={inputClass} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></Field>
          <Field wide label={t('platformAdmin.descriptionLabel', '用户说明')}><textarea className={inputClass} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="Base URL"><input className={inputClass} value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} /></Field>
          <Field label="Model ID"><input className={inputClass} value={draft.modelId} onChange={(e) => setDraft({ ...draft, modelId: e.target.value })} /></Field>
          <Field wide label={draft.id ? t('platformAdmin.apiKeyOptional', 'API Key（留空则保留原密钥）') : 'API Key'}><input type="password" className={inputClass} value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} /></Field>
          <Field label={t('platformAdmin.reasoning', '思考强度')}><select className={inputClass} value={draft.reasoningDepth} onChange={(e) => setDraft({ ...draft, reasoningDepth: e.target.value })}><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="extreme">Extreme</option></select></Field>
          <Field label={t('platformAdmin.searchMode', '联网方式')}><select className={inputClass} value={draft.searchMode} onChange={(e) => setDraft({ ...draft, searchMode: e.target.value })}><option value="platform">{t('modelSelector.platformSearch', '平台联网核验')}</option>{draft.provider !== 'openai_compatible' && <option value="native">{t('modelSelector.nativeSearch', '模型原生联网')}</option>}<option value="none">{t('modelSelector.noSearch', '不联网')}</option></select></Field>
          <Field label={t('platformAdmin.multiplierLabel', '点数倍率')}><input className={inputClass} inputMode="decimal" value={draft.creditMultiplier} onChange={(e) => setDraft({ ...draft, creditMultiplier: e.target.value })} /></Field>
          <Field label={t('platformAdmin.sortOrder', '排序')}><input className={inputClass} inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} /></Field>
          <Field label={t('platformAdmin.inputPrice', '输入成本微美元/百万 Token')}><input className={inputClass} inputMode="numeric" value={draft.inputPriceMicrosPerMillion} onChange={(e) => setDraft({ ...draft, inputPriceMicrosPerMillion: e.target.value })} /></Field>
          <Field label={t('platformAdmin.outputPrice', '输出成本微美元/百万 Token')}><input className={inputClass} inputMode="numeric" value={draft.outputPriceMicrosPerMillion} onChange={(e) => setDraft({ ...draft, outputPriceMicrosPerMillion: e.target.value })} /></Field>
          <Field wide label={t('platformAdmin.searchPrice', '原生搜索成本微美元/次')}><input className={inputClass} inputMode="numeric" value={draft.nativeSearchPriceMicrosPerRequest} onChange={(e) => setDraft({ ...draft, nativeSearchPriceMicrosPerRequest: e.target.value })} /></Field>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">{(['supportsAnalysis', 'supportsCompletion', 'supportsFollowup', 'isEnabled', 'isVisibleToUsers', 'isRecommended', 'isDefault'] as const).map((key) => <label key={key} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs font-bold text-[var(--color-text)]"><input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />{t(`platformAdmin.${key}`, key)}</label>)}</div>
        <details className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><summary className="cursor-pointer text-xs font-black text-[var(--color-text)]">{t('platformAdmin.translations', '多语言名称与说明')}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{LOCALES.map((locale) => <div key={locale} className="space-y-1"><b className="text-xxs text-[var(--color-text-muted)]">{locale}</b><input className={inputClass} placeholder={t('platformAdmin.localizedName', '名称')} value={draft.displayNameI18n[locale] || ''} onChange={(e) => setDraft({ ...draft, displayNameI18n: { ...draft.displayNameI18n, [locale]: e.target.value } })} /><textarea className={inputClass} rows={2} placeholder={t('platformAdmin.localizedDescription', '说明')} value={draft.descriptionI18n[locale] || ''} onChange={(e) => setDraft({ ...draft, descriptionI18n: { ...draft.descriptionI18n, [locale]: e.target.value } })} /></div>)}</div></details>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setExpanded(false)} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-bold text-[var(--color-text)]">{t('common.cancel', '取消')}</button><button type="button" disabled={busy === 'save'} onClick={() => void submit()} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy === 'save' ? t('platformAdmin.saving', '保存中…') : t('common.save', '保存')}</button></div>
      </div>}
    </section>
  );
}

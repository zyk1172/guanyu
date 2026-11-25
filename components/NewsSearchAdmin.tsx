'use client';

import { Button, Input, Panel, Select } from '@/components/ui/controls';
import { useEffect, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';

type Settings = { provider: 'free' | 'deepseek'; aiModelConfigId: string; hasKey: boolean; dailyLimit: number; paidAllowed: boolean; models: Array<{ id: string; name: string }> };
export default function NewsSearchAdmin() {
  const { language } = useUiLanguage();
  const text = (zh: string, en: string) => language.startsWith('zh') ? zh : en;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/admin/news-search', { signal: abort.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('load');
      return response.json();
    }).then(data => { setSettings(data); setError(''); }).catch(() => { if (!abort.signal.aborted) setError(text('新闻搜索设置加载失败，请重试。', 'Could not load news search settings. Retry.')); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  // Language changes affect labels, not the server configuration request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  async function save() {
    if (!settings) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetch('/api/admin/news-search', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: settings.provider, aiModelConfigId: settings.aiModelConfigId, dailyLimit: settings.dailyLimit, apiKey, clearKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(language.startsWith('zh') ? data.error : 'Unable to save news search settings.');
      setSettings({ ...settings, hasKey: !clearKey && (Boolean(apiKey.trim()) || settings.hasKey) });
      setApiKey('');
      setClearKey(false);
      setSaved(true);
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  return <Panel className="settings-form col-span-full" aria-label={text('首页新闻搜索设置', 'Homepage news search settings')}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="ui-panel-title">{text('首页新闻搜索', 'Homepage news search')}</h3><Button variant="secondary" type="button"  disabled={loading || saving} onClick={() => { setLoading(true); setApiKey(''); setClearKey(false); setReload(reload + 1); }}>{text('刷新配置列表', 'Refresh configurations')}</Button></div>
    {loading ? <p role="status" className="mt-4 text-sm">{text('正在加载…', 'Loading…')}</p> : settings && <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="settings-grid md:grid-cols-3">
        <label className="ui-label settings-field"><span>{text('首页默认搜索来源', 'Default news search source')}</span><Select  value={settings.provider} disabled={saving} onChange={event => { setSaved(false); setSettings({ ...settings, provider: event.target.value as Settings['provider'] }); }}><option value="free">{text('网页搜索工具（免费）', 'Free web search')}</option><option value="deepseek" disabled={!settings.paidAllowed}>DeepSeek API</option></Select></label>
        <label className="ui-label settings-field">
          <span>{text('平台 DeepSeek 搜索密钥', 'Platform DeepSeek search key')}</span>
          <Input type="password" autoComplete="new-password" value={apiKey} disabled={saving}
            placeholder={settings.hasKey && !clearKey ? text('已保存', 'Key saved') : ''}
            onChange={event => { setSaved(false); setClearKey(false); setApiKey(event.target.value); }} />
        </label>
        <label className="ui-label settings-field"><span>{text('平台 API 每日调用上限', 'Daily platform API request limit')}</span><Input  type="number" min={1} max={10000} required step={1} value={settings.dailyLimit} disabled={saving} onChange={event => { setSaved(false); setSettings({ ...settings, dailyLimit: Number(event.target.value) }); }} /></label>
      </div>
      {settings.hasKey && <label className="flex min-h-11 items-center gap-2">
        <Input type="checkbox" checked={clearKey} disabled={saving} onChange={event => {
          setSaved(false);
          setClearKey(event.target.checked);
          if (event.target.checked) { setApiKey(''); setSettings({ ...settings, provider: 'free' }); }
        }} />
        {text('移除平台搜索密钥', 'Remove platform search key')}
      </label>}
      <label className="ui-label settings-field">
        <span>{text('可选辅助模型（可能产生模型费用）', 'Optional search assistant (model fees may apply)')}</span>
        <Select value={settings.aiModelConfigId} disabled={saving} onChange={event => {
          setSaved(false); setSettings({ ...settings, aiModelConfigId: event.target.value });
        }}>
          <option value="">{text('关闭辅助模型', 'Disable search assistant')}</option>
          {settings.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        </Select>
      </label>
      {!settings.paidAllowed && <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{text('当前部署通过 GUANYU_ALLOW_DEEPSEEK_NEWS_SEARCH 关闭了首页 DeepSeek 搜索。', 'Homepage DeepSeek search is disabled by GUANYU_ALLOW_DEEPSEEK_NEWS_SEARCH.')}</p>}
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{text('平台限额按北京时间统计上游调用尝试，命中缓存不占额度。DeepSeek 服务费用由平台承担，不额外扣用户搜索点数；报告分析按原规则计费。个人密钥仅向有权限的账号开放。', 'The platform cap counts upstream attempts per Shanghai calendar day; cache hits do not count. The platform pays provider fees. Reports keep their existing pricing. Personal keys require an eligible account.')}</p>
      <Button variant="primary" type="submit" disabled={saving}>{saving ? text('保存中…', 'Saving…') : text('保存新闻搜索设置', 'Save news search settings')}</Button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}{saved && <p role="status" className="mt-3 text-sm text-[var(--color-primary)]">{text('新闻搜索设置已保存。', 'News search settings saved.')}</p>}
  </Panel>;
}

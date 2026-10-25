'use client';
import { useEffect, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';

type Settings = { provider: 'free' | 'deepseek'; modelConfigId: string; dailyLimit: number; paidAllowed: boolean; models: Array<{ id: string; name: string; hasKey: boolean }> };
export default function NewsSearchAdmin() {
  const { language } = useUiLanguage();
  const text = (zh: string, en: string) => language.startsWith('zh') ? zh : en;
  const [settings, setSettings] = useState<Settings | null>(null);
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
      const response = await fetch('/api/admin/news-search', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: settings.provider, modelConfigId: settings.modelConfigId, dailyLimit: settings.dailyLimit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(language.startsWith('zh') ? data.error : 'Unable to save news search settings.');
      setSaved(true);
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }
  return <section className="settings-form col-span-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-[var(--shadow-card)]" aria-label={text('首页新闻搜索设置', 'Homepage news search settings')}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold">{text('首页新闻搜索', 'Homepage news search')}</h3><button type="button" className="workspace-button workspace-secondary" disabled={loading || saving} onClick={() => { setLoading(true); setReload(reload + 1); }}>{text('刷新配置列表', 'Refresh configurations')}</button></div>
    <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{text('首页搜索来源独立于报告分析模型。复用下方模型管理中已保存的 DeepSeek 搜索密钥，无需重复填写；新闻检索不会调用分析模型。访客只使用免费网页搜索。', 'News discovery is independent of report analysis models. Reuse an existing DeepSeek search key from model management below. Searching does not call an analysis model. Visitors use free web search.')}</p>
    {loading ? <p role="status" className="mt-4 text-sm">{text('正在加载…', 'Loading…')}</p> : settings && <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="settings-grid md:grid-cols-3">
        <label className="settings-field"><span>{text('首页默认搜索来源', 'Default news search source')}</span><select className="settings-control" value={settings.provider} disabled={saving} onChange={event => { setSaved(false); setSettings({ ...settings, provider: event.target.value as Settings['provider'] }); }}><option value="free">{text('网页搜索工具（免费）', 'Free web search')}</option><option value="deepseek" disabled={!settings.paidAllowed}>DeepSeek API</option></select></label>
        <label className="settings-field"><span>{text('平台 DeepSeek 搜索密钥来源', 'Platform DeepSeek key configuration')}</span><select className="settings-control" value={settings.modelConfigId} disabled={saving} onChange={event => { setSaved(false); setSettings({ ...settings, modelConfigId: event.target.value }); }}><option value="">{text('不提供平台搜索 API', 'No platform search API')}</option>{settings.models.map(model => <option key={model.id} value={model.id} disabled={!model.hasKey}>{model.name}{!model.hasKey ? text('（未保存搜索密钥）', ' (no search key)') : ''}</option>)}</select></label>
        <label className="settings-field"><span>{text('平台 API 每日调用上限', 'Daily platform API request limit')}</span><input className="settings-control" type="number" min={1} max={10000} required step={1} value={settings.dailyLimit} disabled={saving} onChange={event => { setSaved(false); setSettings({ ...settings, dailyLimit: Number(event.target.value) }); }} /></label>
      </div>
      {!settings.paidAllowed && <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{text('当前部署关闭付费搜索，DeepSeek 暂不可选。需要时由部署者设置 GUANYU_ALLOW_PAID_SEARCH=true；免费搜索不受影响。', 'Paid search is disabled. Set GUANYU_ALLOW_PAID_SEARCH=true in deployment settings to enable DeepSeek. Free search remains available.')}</p>}
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{text('平台限额按北京时间统计上游调用尝试，命中缓存不占额度。DeepSeek 服务费用由平台承担，不额外扣用户搜索点数；报告分析按原规则计费。个人密钥仅向有权限的账号开放。', 'The platform cap counts upstream attempts per Shanghai calendar day; cache hits do not count. The platform pays provider fees. Reports keep their existing pricing. Personal keys require an eligible account.')}</p>
      <button type="submit" disabled={saving} className="workspace-button workspace-primary">{saving ? text('保存中…', 'Saving…') : text('保存新闻搜索设置', 'Save news search settings')}</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}{saved && <p role="status" className="mt-3 text-sm text-[var(--color-primary)]">{text('新闻搜索设置已保存。', 'News search settings saved.')}</p>}
  </section>;
}

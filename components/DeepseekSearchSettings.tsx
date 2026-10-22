'use client';

import { useUiLanguage } from './LanguageProvider';

export default function DeepseekSearchSettings({ provider, apiKey, hasApiKey, clearKey, disabled = false, paidAllowed, onProviderChange, onKeyChange, onClear }: {
  provider: string;
  apiKey: string;
  hasApiKey: boolean;
  clearKey: boolean;
  disabled?: boolean;
  paidAllowed: boolean;
  onProviderChange: (value: string) => void;
  onKeyChange: (value: string) => void;
  onClear: () => void;
}) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  return <section aria-label={zh ? 'DeepSeek 搜索 API 设置' : 'DeepSeek Search API settings'} className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
    <div><h4 className="text-xs font-black">DeepSeek Search API</h4><p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{zh ? '选择网页搜索来源，适用于平台联网核验和模型自主查证。网页读取继续使用免费工具；搜索 Key 可独立于模型 Key 配置。' : 'Choose a search source for platform verification and model-led research. Page reading still uses the free tool. The search key is separate from the model key.'}</p></div>
    <label className="block space-y-1 text-xs font-bold"><span>{zh ? '网页搜索来源' : 'Web search source'}</span><select value={provider} disabled={disabled} onChange={(e) => onProviderChange(e.target.value)} className="w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 font-normal disabled:opacity-60"><option value="free">{zh ? '免费网页搜索（默认）' : 'Free web search (default)'}</option><option value="deepseek" disabled={!paidAllowed}>DeepSeek Search API</option></select></label>
    <label className="block space-y-1 text-xs font-bold"><span>DeepSeek Search API Key</span><input type="password" value={apiKey} disabled={disabled} autoComplete="new-password" onChange={(e) => onKeyChange(e.target.value)} placeholder={hasApiKey && !clearKey ? (zh ? '已保存，留空保留原密钥' : 'Saved; leave blank to keep') : (zh ? '填写 DeepSeek API Key' : 'Enter a DeepSeek API key')} className="w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 font-mono font-normal disabled:opacity-60" /></label>
    {hasApiKey && !clearKey && <button type="button" disabled={disabled} onClick={onClear} className="text-xs font-bold text-[var(--color-danger)] underline disabled:opacity-60">{zh ? '清除已保存的搜索密钥' : 'Clear saved search key'}</button>}
    {clearKey && <p role="status" className="text-xs text-[var(--color-text-muted)]">{zh ? '保存后清除密钥，并改用免费搜索。' : 'Saving will clear the key and use free search.'}</p>}
    <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{zh ? '密钥加密保存，不会回显。按 DeepSeek 官方标价，每 1,000 次成功且有结果的搜索为 $0.75；空结果和失败请求不计费。模型费用另计。' : 'Keys are encrypted and never returned. DeepSeek lists $0.75 per 1,000 successful searches with results; empty results and failures are not billed. Model fees are separate.'} <a className="font-bold text-[var(--color-link)] underline" href="https://api-docs.deepseek.com/guides/search" target="_blank" rel="noopener noreferrer">{zh ? '官方文档与价格' : 'Official guide and pricing'}</a></p>
    {!paidAllowed && <p role="status" className="text-xs leading-relaxed text-[var(--color-warning)]">{zh ? '当前部署未启用付费搜索，仍使用免费搜索。可以先保存 Key；部署者启用付费搜索后，即可在上方选择 DeepSeek。' : 'Paid search is disabled for this deployment, so free search remains active. Save a key now and select DeepSeek after the deployment enables paid search.'}</p>}
  </section>;
}

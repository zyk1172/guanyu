import { encryptSecret } from './secret';

type StoredSearchSettings = { searchProvider?: string; deepseekApiKeyEncrypted?: string | null };

export function deepseekSettingsUpdate(body: Record<string, unknown>, current?: StoredSearchSettings | null): { searchProvider?: string; deepseekApiKeyEncrypted?: string | null } {
  if (body.searchProvider !== undefined && !['free', 'deepseek'].includes(String(body.searchProvider))) throw new Error('不支持的网页搜索来源。');
  if (body.deepseekApiKey !== undefined && typeof body.deepseekApiKey !== 'string') throw new Error('DeepSeek API Key 格式无效。');
  const key = typeof body.deepseekApiKey === 'string' ? body.deepseekApiKey.trim() : '';
  if (key.length > 5000) throw new Error('DeepSeek API Key 过长。');
  const clear = body.clearDeepseekApiKey === true;
  if (clear && key) throw new Error('请分别保存新密钥或清除旧密钥。');
  const provider = body.searchProvider ?? current?.searchProvider ?? 'free';
  if (provider === 'deepseek' && !key && (clear || !current?.deepseekApiKeyEncrypted)) throw new Error('使用 DeepSeek 搜索前请先填写 API Key。');
  return {
    ...(body.searchProvider !== undefined ? { searchProvider: String(body.searchProvider) } : {}),
    ...(key ? { deepseekApiKeyEncrypted: encryptSecret(key) } : clear ? { deepseekApiKeyEncrypted: null } : {}),
  };
}

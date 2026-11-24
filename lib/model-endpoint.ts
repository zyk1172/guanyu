import { isOfficialOpenAiApiBaseUrl } from './platform-model-core.mjs';

export function normalizeModelBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('模型接口只允许 HTTP 或 HTTPS。');
  if (url.username || url.password || url.href.includes('?') || url.href.includes('#')) {
    throw new Error('模型接口地址不能包含凭据、查询参数或片段。');
  }
  return url.href.replace(/\/+$/, '');
}

export function sameModelBaseUrl(before: string, after: string) {
  try {
    return normalizeModelBaseUrl(before) === normalizeModelBaseUrl(after);
  } catch {
    return false;
  }
}


export const personalModelProviders = ['openai_compatible', 'openai', 'anthropic'] as const;
export type PersonalModelProvider = (typeof personalModelProviders)[number];

export function personalModelProvider(value: unknown): PersonalModelProvider {
  return value === 'openai' || value === 'anthropic' ? value : 'openai_compatible';
}

export function assertPersonalModelEndpoint(baseUrl: string, provider: PersonalModelProvider) {
  if (provider === 'openai' && !isOfficialOpenAiApiBaseUrl(baseUrl)) {
    throw new Error('OpenAI Responses 模式须使用官方 OpenAI 接口地址。');
  }
  if (provider === 'anthropic' && baseUrl !== 'https://api.anthropic.com/v1') {
    throw new Error('Anthropic Messages 模式须使用官方 https://api.anthropic.com/v1 接口地址。');
  }
}

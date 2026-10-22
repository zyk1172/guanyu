import type { WebSearchSource } from './search';

export const DEEPSEEK_SEARCH_ENDPOINT = 'https://api.deepseek.com/v1/tools/search';

export function normalizeDeepseekSearchResponse(payload: unknown): WebSearchSource[] {
  if (!payload || typeof payload !== 'object' || !('results' in payload) || !Array.isArray(payload.results)) return [];
  const seen = new Set<string>();
  return payload.results.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    try {
      if (typeof row.url !== 'string') return [];
      const url = new URL(row.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return [];
      url.hash = '';
      if (seen.has(url.href)) return [];
      seen.add(url.href);
      const text = [row.summary, row.snippet].find((value) => typeof value === 'string' && value.trim());
      return [{ title: typeof row.title === 'string' && row.title.trim() ? row.title.trim().slice(0, 300) : url.hostname, url: url.href, snippet: typeof text === 'string' ? text.trim().slice(0, 2000) : '', provider: 'deepseek' }];
    } catch { return []; }
  });
}

export async function searchDeepseek(query: string, limit: number, options: {
  apiKey?: string;
  timeoutMs?: number;
  onRequest?: (provider: string) => void;
  /** Test transport only; the endpoint cannot be changed by account settings. */
  fetch?: typeof fetch;
}): Promise<WebSearchSource[]> {
  const key = options.apiKey?.trim();
  const normalizedQuery = Array.from(query.trim()).slice(0, 128).join('');
  if (!key || !normalizedQuery) return [];
  let billable = false;
  try {
    const response = await (options.fetch || fetch)(DEEPSEEK_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: normalizedQuery, count: Math.min(50, Math.max(1, Math.floor(limit) || 5)), need_content: false }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs || 15_000),
    });
    if (!response.ok) throw new Error('deepseek_search_unavailable');
    const payload = await response.json();
    // DeepSeek bills only HTTP 200 responses with non-empty results, including
    // any provider result we subsequently discard during URL normalization.
    billable = Array.isArray(payload?.results) && payload.results.length > 0;
    return normalizeDeepseekSearchResponse(payload).slice(0, limit);
  } catch {
    // Never expose upstream diagnostics or credentials in a tool response.
    throw new Error('deepseek_search_unavailable');
  } finally {
    options.onRequest?.(billable ? 'deepseek' : 'deepseek_unbilled');
  }
}

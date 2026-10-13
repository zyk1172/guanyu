import { buildTavilySearchRequest, normalizeTavilySearchResponse } from './tavily-core.mjs';
import { buildSerperSearchRequest, normalizeSerperSearchResponse } from './serper-core.mjs';
import type { ReportLanguage } from './types';
import { searchFreeWeb, type FreeSearchOptions } from './free-web-search';
import { paidSearchAllowed } from './web-search-policy';

export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
  provider?: string;
}

export interface WebSearchOptions {
  provider?: 'none' | 'free' | 'tavily' | 'serper' | 'multi' | 'duckduckgo';
  tavilyApiKey?: string;
  tavilySearchDepth?: 'basic' | 'advanced' | string;
  serperApiKey?: string;
  locale?: ReportLanguage;
  timeoutMs?: number;
  onRequest?: (provider: string) => void;
  freeSearchOptions?: FreeSearchOptions;
}

const SEARCH_TIMEOUT_MS = 15_000;

async function searchTavily(query: string, limit: number, options: WebSearchOptions): Promise<WebSearchSource[]> {
  const apiKey = options.tavilyApiKey?.trim();
  if (!apiKey) return [];

  try {
    options.onRequest?.(options.tavilySearchDepth === 'advanced' ? 'tavily_advanced' : 'tavily_basic');
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildTavilySearchRequest(query, limit, options.tavilySearchDepth || 'basic')),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs || SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Tavily search failed with status:', response.status);
      return [];
    }

    const payload = await response.json();
    return normalizeTavilySearchResponse(payload)
      .slice(0, limit)
      .map((item: Omit<WebSearchSource, 'provider'>) => ({ ...item, provider: 'tavily' as const }));
  } catch {
    console.error('Tavily search failed');
    return [];
  }
}

async function searchSerper(query: string, limit: number, options: WebSearchOptions): Promise<WebSearchSource[]> {
  const apiKey = options.serperApiKey?.trim();
  if (!apiKey) return [];

  try {
    options.onRequest?.('serper');
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(buildSerperSearchRequest(query, limit, options.locale)),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs || SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Serper search failed with status:', response.status);
      return [];
    }

    const payload = await response.json();
    return normalizeSerperSearchResponse(payload)
      .slice(0, limit)
      .map((item: Omit<WebSearchSource, 'provider'>) => ({ ...item, provider: 'serper' as const }));
  } catch {
    console.error('Serper search failed');
    return [];
  }
}

function dedupeSources(sources: WebSearchSource[]) {
  const seen = new Set<string>();
  const result: WebSearchSource[] = [];

  for (const source of sources) {
    const key = source.url.trim().replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}

export async function searchWeb(query: string, limit = 5, options: WebSearchOptions = {}): Promise<WebSearchSource[]> {
  const provider = options.provider || 'free';
  if (provider === 'none') return [];
  if (!paidSearchAllowed() || provider === 'free' || provider === 'duckduckgo') {
    try {
      return (await searchFreeWeb(query, limit, { ...options.freeSearchOptions, locale: options.locale, onRequest: options.onRequest, deadline: options.freeSearchOptions?.deadline ?? Date.now() + Math.min(15_000, options.timeoutMs || SEARCH_TIMEOUT_MS) })).sources;
    } catch { return []; }
  }
  if (provider === 'tavily') return searchTavily(query, limit, options);
  if (provider === 'serper') return searchSerper(query, limit, options);
  if (provider === 'multi') {
    const [tavilyResults, serperResults] = await Promise.all([
      options.tavilyApiKey ? searchTavily(query, limit, options) : Promise.resolve([]),
      options.serperApiKey ? searchSerper(query, limit, options) : Promise.resolve([]),
    ]);
    return dedupeSources([...tavilyResults, ...serperResults]).slice(0, limit);
  }
  return [];
}

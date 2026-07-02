import { buildTavilySearchRequest, normalizeTavilySearchResponse } from './tavily-core.mjs';
import { buildSerperSearchRequest, normalizeSerperSearchResponse } from './serper-core.mjs';

export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
  provider?: 'tavily' | 'serper' | 'duckduckgo';
}

export interface WebSearchOptions {
  provider?: 'none' | 'tavily' | 'serper' | 'multi' | 'duckduckgo';
  tavilyApiKey?: string;
  tavilySearchDepth?: 'basic' | 'advanced' | string;
  serperApiKey?: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '));
}

function normalizeDuckDuckGoUrl(value: string): string {
  const decoded = decodeHtml(value);

  try {
    const url = new URL(decoded, 'https://duckduckgo.com');
    const redirected = url.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return decoded;
  }
}

async function searchTavily(query: string, limit: number, options: WebSearchOptions): Promise<WebSearchSource[]> {
  const apiKey = options.tavilyApiKey?.trim();
  if (!apiKey) return [];

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildTavilySearchRequest(query, limit, options.tavilySearchDepth || 'basic')),
      cache: 'no-store',
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

async function searchDuckDuckGo(query: string, limit = 5): Promise<WebSearchSource[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return [];

  try {
    const response = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) return [];

    const html = await response.text();
    const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/g) || [];

    const results: WebSearchSource[] = [];
    for (const block of blocks) {
      const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) continue;

      const item: WebSearchSource = {
        title: stripHtml(titleMatch[2]),
        url: normalizeDuckDuckGoUrl(titleMatch[1]),
        snippet: snippetMatch ? stripHtml(snippetMatch[1]) : '',
        provider: 'duckduckgo',
      };
      if (item.title && item.url) results.push(item);
      if (results.length >= limit) break;
    }

    return results;
  } catch (error) {
    console.error('Web search failed:', error);
    return [];
  }
}

async function searchSerper(query: string, limit: number, options: WebSearchOptions): Promise<WebSearchSource[]> {
  const apiKey = options.serperApiKey?.trim();
  if (!apiKey) return [];

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(buildSerperSearchRequest(query, limit)),
      cache: 'no-store',
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
  const provider = options.provider || 'none';
  if (provider === 'none') return [];
  if (provider === 'tavily') return searchTavily(query, limit, options);
  if (provider === 'serper') return searchSerper(query, limit, options);
  if (provider === 'multi') {
    const [tavilyResults, serperResults] = await Promise.all([
      options.tavilyApiKey ? searchTavily(query, limit, options) : Promise.resolve([]),
      options.serperApiKey ? searchSerper(query, limit, options) : Promise.resolve([]),
    ]);
    return dedupeSources([...tavilyResults, ...serperResults]).slice(0, limit);
  }
  return searchDuckDuckGo(query, limit);
}

import type { WebSearchSource } from './search';
import type { NewsArticle, NewsSearchResult, NewsProvider, NewsPeriod } from './news-search-types';

export function normalizeNewsQuery(value: unknown) {
  if (typeof value !== 'string') return null;
  const query = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return Array.from(query).length >= 2 && Array.from(query).length <= 128 && !/[\u0000-\u001f\u007f]/.test(query) ? query : null;
}

export function newsUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /^(localhost|127\.|0\.|\[|10\.|192\.168\.|169\.254\.)/i.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) || !url.hostname.includes('.')) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) url.searchParams.delete(key);
    const normalized = url.toString();
    return normalized.length <= 2048 ? normalized : null;
  } catch { return null; }
}

export function newsDate(value: unknown, now = Date.now()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T|\s)/.test(value.trim())) return null;
  const calendarDate = value.trim().slice(0, 10);
  const midnight = new Date(`${calendarDate}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== calendarDate) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= now + 3600_000 ? date.toISOString() : null;
}

export function normalizeNewsArticles(sources: WebSearchSource[]): NewsArticle[] {
  const seen = new Set<string>();
  return sources.flatMap(source => {
    const url = newsUrl(source.url);
    const title = source.title?.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!url || !title) return [];
    // URL paths are case-sensitive. Tracking links and fragment variants dedupe.
    const key = url.replace(/\/$/, '');
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ url, title, snippet: (source.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 800), source: source.sourceName?.trim().slice(0, 120) || new URL(url).hostname.replace(/^www\./, ''), publishedAt: newsDate(source.publishedAt), provider: source.provider || 'web' }];
  }).slice(0, 10);
}

export const NEWS_SEARCH_DRAFT_KEY = 'guanyu-news-search-v1';
export type NewsSearchDraft = { query: string; provider: NewsProvider; period: NewsPeriod; result: NewsSearchResult | null; pending: NewsArticle | null };
export function encodeNewsSearchDraft(draft: NewsSearchDraft, now = Date.now()) {
  return JSON.stringify({ ...draft, savedAt: now });
}
export function decodeNewsSearchDraft(raw: string | null, now = Date.now()): NewsSearchDraft | null {
  if (!raw || raw.length > 60_000) return null;
  try {
    const data = JSON.parse(raw);
    if (!Number.isFinite(data.savedAt) || data.savedAt > now + 60_000 || now - data.savedAt >= 30 * 60_000 || !normalizeNewsQuery(data.query) || !['free', 'deepseek'].includes(data.provider) || !['any', 'day', 'week', 'month'].includes(data.period)) return null;
    if (data.result !== null && (!Array.isArray(data.result?.articles) || data.result.articles.length > 10 || !Array.isArray(data.result.providers) || data.result.providers.length > 5 || !data.result.providers.every((provider: unknown) => typeof provider === 'string' && provider.length <= 32) || !['free', 'deepseek'].includes(data.result.requestedProvider) || typeof data.result.searchedAt !== 'string' || !Number.isFinite(Date.parse(data.result.searchedAt)) || typeof data.result.cached !== 'boolean' || typeof data.result.webFallback !== 'boolean' || typeof data.result.timeFilterApplied !== 'boolean')) return null;
    const valid = (a: NewsArticle) => a && typeof a.title === 'string' && a.title.length <= 300 && typeof a.snippet === 'string' && a.snippet.length <= 800 && typeof a.source === 'string' && a.source.length <= 120 && newsUrl(a.url) && typeof a.provider === 'string' && (a.publishedAt === null || newsDate(a.publishedAt));
    if (data.result?.articles.some((a: NewsArticle) => !valid(a)) || (data.pending !== null && !valid(data.pending))) return null;
    return { query: data.query, provider: data.provider, period: data.period, result: data.result, pending: data.pending };
  } catch { return null; }
}

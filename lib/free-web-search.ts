import * as cheerio from 'cheerio';
import { safeOutboundRequest, UnsafeOutboundUrlError } from './safe-outbound';
import type { WebSearchSource } from './search';

export type SearchTransport = typeof safeOutboundRequest;
export type SearchAttempt = { provider: string; outcome: 'results' | 'empty' | 'challenge' | 'unavailable' };
export type FreeSearchOptions = {
  request?: SearchTransport;
  searxngUrl?: string;
  allowPrivateSearxng?: boolean;
  locale?: string;
  deadline?: number;
  onRequest?: (provider: string) => void;
};

export function resultUrl(value: string, base: string) {
  try {
    if (value.length > 2048) return null;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    const normalized = url.toString();
    return normalized.length <= 2048 ? normalized : null;
  } catch { return null; }
}

function challenge(html: string) {
  const $ = cheerio.load(html);
  return !!$('#challenge-form, .anomaly-modal, #b_captcha, #captcha, #cf-challenge-running, form#captcha-form').length
    || /^(Just a moment|Attention Required|Verify you are human)/i.test($('title').text().trim());
}

export function parseFreeSearchHtml(html: string, base: string, provider: 'bing' | 'duckduckgo', limit = 5): WebSearchSource[] {
  if (challenge(html)) throw new Error('search_challenge');
  const $ = cheerio.load(html);
  const results: WebSearchSource[] = [];
  const add = (href: string | undefined, title: string, snippet: string) => {
    if (!href || !title.trim()) return;
    let url = resultUrl(href, base);
    if (!url) return;
    const target = new URL(url);
    if (/(^|\.)duckduckgo\.com$/.test(target.hostname) && target.searchParams.has('uddg')) {
      url = resultUrl(target.searchParams.get('uddg')!, base);
    } else if (/(^|\.)bing\.com$/.test(target.hostname) && target.pathname === '/ck/a') {
      const encoded = target.searchParams.get('u');
      url = encoded?.startsWith('a1') ? resultUrl(Buffer.from(encoded.slice(2), 'base64url').toString('utf8'), base) : null;
    }
    if (url && results.length < limit && !results.some(item => item.url === url)) {
      results.push({ title: title.trim().slice(0, 300), url, snippet: snippet.trim().slice(0, 800), provider });
    }
  };
  if (provider === 'bing') {
    $('#b_results .b_algo:not(.b_ad)').each((_i, element) => {
      const block = $(element); const link = block.find('h2 a').first();
      add(link.attr('href'), link.text(), block.find('.b_caption p, .b_snippet').first().text());
    });
  } else {
    $('.result').each((_i, element) => {
      const block = $(element); const link = block.find('a.result__a').first();
      add(link.attr('href'), link.text(), block.find('.result__snippet').text());
    });
    // DuckDuckGo's no-JavaScript Lite interface uses paired table rows.
    $('a.result-link').each((_i, element) => {
      const link = $(element); const row = link.closest('tr');
      add(link.attr('href'), link.text(), row.nextAll('tr').slice(0, 2).find('.result-snippet').first().text());
    });
  }
  return results;
}

export class FreeSearchError extends Error {
  constructor(message: string, readonly attempts: SearchAttempt[]) { super(message); }
}

function matchesQuerySites(source: WebSearchSource, query: string) {
  const sites = [...query.matchAll(/(?:^|\s)site:([a-z0-9.-]+)(\/[^\s]*)?/gi)];
  if (!sites.length) return true;
  const url = new URL(source.url);
  return sites.some(match => {
    const hostname = match[1].toLowerCase();
    return (url.hostname === hostname || url.hostname.endsWith(`.${hostname}`))
      && (!match[2] || url.pathname === match[2] || url.pathname.startsWith(`${match[2].replace(/\/$/, '')}/`));
  });
}

/** One bounded chain shared by fixed search and Function Calling. No paid fallback. */
export async function searchFreeWeb(query: string, limit = 5, options: FreeSearchOptions = {}) {
  const normalized = query.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!normalized) return { sources: [], attempts: [] };
  const deadline = options.deadline ?? Date.now() + 15_000;
  const request = options.request || safeOutboundRequest;
  const configured = options.searxngUrl ?? process.env.WEB_RESEARCH_SEARXNG_URL;
  const targets: Array<{ url: string; provider: 'searxng' | 'bing' | 'duckduckgo'; private: boolean }> = [];
  if (configured) {
    try {
      const url = new URL(configured);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid');
      url.pathname = `${url.pathname.replace(/\/$/, '')}/search`;
      url.searchParams.set('q', normalized); url.searchParams.set('format', 'json');
      url.searchParams.set('language', options.locale || 'auto');
      url.searchParams.set('safesearch', '1');
      targets.push({ url: url.toString(), provider: 'searxng', private: options.allowPrivateSearxng ?? process.env.WEB_RESEARCH_ALLOW_PRIVATE_SEARXNG === 'true' });
    } catch { /* Invalid deployment configuration can still use public engines. */ }
  }
  const bing = new URL('https://www.bing.com/search');
  bing.searchParams.set('q', normalized);
  if (options.locale) bing.searchParams.set('setlang', options.locale);
  targets.push({ url: bing.toString(), provider: 'bing', private: false });
  for (const endpoint of ['https://html.duckduckgo.com/html/', 'https://lite.duckduckgo.com/lite/']) {
    const url = new URL(endpoint); url.searchParams.set('q', normalized);
    targets.push({ url: url.toString(), provider: 'duckduckgo', private: false });
  }
  const attempts: SearchAttempt[] = [];
  for (const target of targets) {
    if (Date.now() >= deadline) break;
    try {
      const targetDeadline = Math.min(deadline, Date.now() + 4_000);
      let url = target.url;
      let response;
      for (let redirects = 0; redirects <= 2; redirects++) {
        const remaining = targetDeadline - Date.now();
        if (remaining <= 0) throw new Error('search_unavailable');
        options.onRequest?.(target.provider);
        response = await request(url, {
          timeoutMs: Math.min(4_000, remaining), maxBytes: 2_000_000,
          // A redirect off the configured service never inherits private access.
          allowPrivateAddress: target.private && new URL(url).origin === new URL(target.url).origin,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuanyuResearch/1.0)', Accept: 'text/html,application/json', 'Accept-Encoding': 'identity', 'Accept-Language': options.locale || 'en-US,en;q=0.8' },
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (!location || redirects === 2) throw new Error('search_unavailable');
        url = new URL(location, url).toString();
      }
      if (!response) throw new Error('search_unavailable');
      const body = response.body.toString('utf8');
      if (response.status === 202 || challenge(body)) throw new Error('search_challenge');
      if (response.status !== 200) throw new Error('search_unavailable');
      let sources: WebSearchSource[];
      if (target.provider === 'searxng') {
        const payload = JSON.parse(body);
        if (!Array.isArray(payload.results)) throw new Error('search_unavailable');
        sources = payload.results.slice(0, 100).flatMap((item: Record<string, unknown>) => {
          if (!item || typeof item !== 'object' || typeof item.url !== 'string') return [];
          const link = resultUrl(item.url, url);
          const title = typeof item.title === 'string' ? item.title.trim() : '';
          return link && title ? [{ url: link, title: title.slice(0, 300), snippet: typeof item.content === 'string' ? cheerio.load(item.content.slice(0, 5000)).text().trim().slice(0, 800) : '', provider: 'searxng' }] : [];
        }).filter((item: WebSearchSource, i: number, all: WebSearchSource[]) => all.findIndex(other => other.url === item.url) === i);
      } else sources = parseFreeSearchHtml(body, url, target.provider, 30);
      sources = sources.filter(source => matchesQuerySites(source, normalized)).slice(0, Math.min(10, Math.max(1, limit)));
      attempts.push({ provider: target.provider, outcome: sources.length ? 'results' : 'empty' });
      if (sources.length) return { sources, attempts };
    } catch (error) {
      if (error instanceof UnsafeOutboundUrlError) {
        attempts.push({ provider: target.provider, outcome: 'unavailable' });
      } else attempts.push({ provider: target.provider, outcome: error instanceof Error && error.message === 'search_challenge' ? 'challenge' : 'unavailable' });
    }
  }
  throw new FreeSearchError(attempts.length && attempts.every(a => a.outcome === 'challenge') ? 'search_challenge' : 'search_unavailable', attempts);
}

import * as cheerio from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { safeOutboundRequest, UnsafeOutboundUrlError } from './safe-outbound';
import { newsDate, newsUrl } from './news-search-core';
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
  category?: 'news';
  timeRange?: 'day' | 'week' | 'month';
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

export function parseBingNewsHtml(html: string): WebSearchSource[] {
  if (challenge(html)) throw new Error('search_challenge');
  const $ = cheerio.load(html);
  return $('.news-card').toArray().flatMap(element => {
    const card = $(element);
    const link = card.find('a.title').first();
    const url = resultUrl(link.attr('href') || '', 'https://www.bing.com');
    if (!url || new URL(url).hostname.endsWith('bing.com') || !link.text().trim()) return [];
    // Only explicit machine-readable dates; relative labels are not guessed.
    const publishedAt = card.find('time[datetime]').first().attr('datetime') || null;
    return [{ title: link.text().trim().slice(0, 300), url, snippet: card.find('.snippet').first().text().trim().slice(0, 800), sourceName: link.attr('data-author') || card.find('.source img[title]').first().attr('title') || card.find('.source a').first().text().trim(), publishedAt, provider: 'bing' }];
  });
}

/** Bing's news feed includes publisher links and machine-readable publication dates. */
export function parseBingNewsRss(xml: string): WebSearchSource[] {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('search_unavailable');
  const channel = new XMLParser().parse(xml)?.rss?.channel;
  if (!channel || typeof channel !== 'object') throw new Error('search_unavailable');
  const items = channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  return items.slice(0, 100).flatMap((item: Record<string, unknown>) => {
    if (!item || typeof item !== 'object' || typeof item.link !== 'string' || typeof item.title !== 'string' || !item.title.trim()) return [];
    let url = resultUrl(item.link, 'https://www.bing.com');
    if (!url) return [];
    const link = new URL(url);
    if (/(^|\.)bing\.com$/i.test(link.hostname)) {
      // Only unwrap the documented feed click link; never return a search-engine page as an article.
      if (link.pathname.toLowerCase() !== '/news/apiclick.aspx') return [];
      url = resultUrl(link.searchParams.get('url') || '', 'https://www.bing.com');
      if (!url || /(^|\.)bing\.com$/i.test(new URL(url).hostname)) return [];
    }
    const date = typeof item.pubDate === 'string' ? Date.parse(item.pubDate) : NaN;
    return [{
      title: item.title.trim().slice(0, 300), url,
      snippet: typeof item.description === 'string' ? cheerio.load(item.description.slice(0, 5000)).text().trim().slice(0, 800) : '',
      sourceName: typeof item['News:Source'] === 'string' ? item['News:Source'].trim().slice(0, 120) : '',
      publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
      provider: 'bing',
    }];
  });
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
  const targets: Array<{ url: string; provider: 'searxng' | 'bing' | 'duckduckgo'; private: boolean; kind?: 'news-rss' | 'news-html' }> = [];
  if (configured) {
    try {
      const url = new URL(configured);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid');
      url.pathname = `${url.pathname.replace(/\/$/, '')}/search`;
      url.searchParams.set('q', normalized); url.searchParams.set('format', 'json');
      url.searchParams.set('language', options.locale || 'auto');
      url.searchParams.set('safesearch', '1');
      if (options.category === 'news') url.searchParams.set('categories', 'news');
      if (options.timeRange) url.searchParams.set('time_range', options.timeRange);
      targets.push({ url: url.toString(), provider: 'searxng', private: options.allowPrivateSearxng ?? process.env.WEB_RESEARCH_ALLOW_PRIVATE_SEARXNG === 'true' });
    } catch { /* Invalid deployment configuration can still use public engines. */ }
  }
  const bing = new URL(options.category === 'news' ? 'https://www.bing.com/news/search' : 'https://www.bing.com/search');
  bing.searchParams.set('q', normalized);
  if (options.locale) bing.searchParams.set('setlang', options.locale);
  if (options.timeRange) bing.searchParams.set('qft', `interval="${{ day: 7, week: 8, month: 9 }[options.timeRange]}"`);
  if (options.category === 'news') {
    const rss = new URL(bing); rss.searchParams.set('format', 'rss');
    targets.push({ url: rss.toString(), provider: 'bing', private: false, kind: 'news-rss' });
    targets.push({ url: bing.toString(), provider: 'bing', private: false, kind: 'news-html' });
  } else targets.push({ url: bing.toString(), provider: 'bing', private: false });
  // Ordinary web results must never be presented as news reports.
  for (const endpoint of options.category === 'news' || options.timeRange ? [] : ['https://html.duckduckgo.com/html/', 'https://lite.duckduckgo.com/lite/']) {
    const url = new URL(endpoint); url.searchParams.set('q', normalized);
    targets.push({ url: url.toString(), provider: 'duckduckgo', private: false });
  }
  const attempts: SearchAttempt[] = [];
  const newsGroups: WebSearchSource[][] = [];
  for (const target of targets) {
    if (target.kind === 'news-html' && newsGroups.length > 0) continue;
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
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuanyuResearch/1.0)', Accept: 'application/rss+xml,application/xml,text/html,application/json', 'Accept-Encoding': 'identity', 'Accept-Language': options.locale || 'en-US,en;q=0.8' },
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
          return link && title ? [{ url: link, title: title.slice(0, 300), snippet: typeof item.content === 'string' ? cheerio.load(item.content.slice(0, 5000)).text().trim().slice(0, 800) : '', publishedAt: typeof item.publishedDate === 'string' ? item.publishedDate : null, provider: 'searxng' }] : [];
        }).filter((item: WebSearchSource, i: number, all: WebSearchSource[]) => all.findIndex(other => other.url === item.url) === i);
      } else if (target.kind === 'news-rss') sources = parseBingNewsRss(body);
      else if (target.kind === 'news-html') {
        // A consent/challenge/error page with HTTP 200 is not evidence of an empty search.
        if (!/class=["'][^"']*news-card\b/i.test(body)) throw new Error('search_unavailable');
        sources = parseBingNewsHtml(body);
      } else sources = parseFreeSearchHtml(body, url, target.provider, 30);
      sources = sources.filter(source => matchesQuerySites(source, normalized));
      if (options.category === 'news') {
        const minimumDate = options.timeRange ? Date.now() - { day: 1, week: 7, month: 30 }[options.timeRange] * 24 * 60 * 60 * 1000 : null;
        sources = sources.filter(source => {
          if (!newsUrl(source.url)) return false;
          if (minimumDate === null) return true;
          const date = newsDate(source.publishedAt);
          return date !== null && Date.parse(date) >= minimumDate;
        });
      }
      sources = sources.slice(0, Math.min(10, Math.max(1, limit)));
      attempts.push({ provider: target.provider, outcome: sources.length ? 'results' : 'empty' });
      if (sources.length && options.category !== 'news') return { sources, attempts };
      if (sources.length) newsGroups.push(sources);
    } catch (error) {
      if (error instanceof UnsafeOutboundUrlError) {
        attempts.push({ provider: target.provider, outcome: 'unavailable' });
      } else attempts.push({ provider: target.provider, outcome: error instanceof Error && error.message === 'search_challenge' ? 'challenge' : 'unavailable' });
    }
  }
  if (options.category === 'news') {
    // Interleave the independent news indexes so one configured engine cannot monopolize the list.
    const sources: WebSearchSource[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) for (const group of newsGroups) {
      const source = group[i];
      const url = source && newsUrl(source.url);
      const key = url?.replace(/\/$/, '');
      if (source && key && !seen.has(key) && sources.length < Math.min(10, Math.max(1, limit))) {
        seen.add(key); sources.push(source);
      }
    }
    if (sources.length || attempts.some(attempt => attempt.outcome === 'empty')) return { sources, attempts };
  }
  throw new FreeSearchError(attempts.length && attempts.every(a => a.outcome === 'challenge') ? 'search_challenge' : 'search_unavailable', attempts);
}

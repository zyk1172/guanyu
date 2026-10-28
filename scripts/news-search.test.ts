import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNewsQuery, normalizeNewsArticles, newsDate, newsUrl, encodeNewsSearchDraft, decodeNewsSearchDraft } from '../lib/news-search-core';
import { parseBingNewsHtml, parseBingNewsRss, searchFreeWeb } from '../lib/free-web-search';
import type { NewsArticle } from '../lib/news-search-types';
import { publicAuditDto, ownerAuditDto } from '../lib/audit-dto';
import { usageCostBreakdown } from '../lib/usage-cost';

const article: NewsArticle = { title: 'Event report', url: 'https://news.example/report', snippet: 'Search excerpt', source: 'News', provider: 'bing', publishedAt: null };
const html = '<div class="news-card"><a class="title" data-author="Public News" href="https://news.example/story?utm_source=bing">An event &amp; evidence</a><div class="snippet">A reported event</div><time datetime="2026-01-01T08:00:00Z"></time></div>';
const reply = (body: string) => ({ status: 200, headers: new Headers(), body: Buffer.from(body) });
const feed = (items: string) => `<?xml version="1.0"?><rss version="2.0" xmlns:News="urn:news"><channel><title>News</title>${items}</channel></rss>`;
const feedItem = (url: string, title: string, date: string) => `<item><title>${title}</title><link>https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(url)}</link><description><![CDATA[<b>Article excerpt</b>]]></description><pubDate>${date}</pubDate><News:Source>Public News</News:Source></item>`;
test('news queries use Unicode character limits and normalize whitespace', () => {
  assert.equal(normalizeNewsQuery('  新能源\n  出口  '), '新能源 出口');
  assert.equal(normalizeNewsQuery('ＡＩ'), 'AI');
  for (const value of [null, '', 'a', '😀', 'x'.repeat(129), 'ab\u0000']) assert.equal(normalizeNewsQuery(value), null);
});
test('news results dedupe tracking links, preserve case-sensitive paths, and reject unsafe URLs', () => {
  const results = normalizeNewsArticles([
    { title: 'Story', url: article.url + '?utm_campaign=x#fragment', snippet: 'x', provider: 'bing' },
    { title: 'Duplicate', url: article.url, snippet: '' },
    { title: 'Different', url: 'https://news.example/REPORT', snippet: '' },
    { title: 'Unsafe', url: 'javascript:alert(1)', snippet: '' },
  ]);
  assert.equal(results.length, 2); assert.equal(results[0].url, article.url); assert.equal(results[0].publishedAt, null);
  for (const url of ['http://127.0.0.1/x', 'http://10.0.0.1', 'http://192.168.1.1', 'http://172.31.2.1', 'http://[::1]/', 'https://user:password@example.com', 'file:///etc/passwd']) assert.equal(newsUrl(url), null);
  assert.equal(newsUrl('https://news.example/' + '新'.repeat(500)), null);
});
test('publication dates must be explicit, valid and not in the future', () => {
  assert.equal(newsDate('2026-01-01'), '2026-01-01T00:00:00.000Z');
  for (const value of ['3 days ago', 'yesterday', 'invalid', '2099-01-01', '2026-02-30']) assert.equal(newsDate(value), null);
});
test('Bing News parser reads actual article cards and source attribution', () => {
  const rows = parseBingNewsHtml(html);
  assert.equal(rows[0].title, 'An event & evidence'); assert.equal(rows[0].sourceName, 'Public News');
  assert.equal(rows[0].publishedAt, '2026-01-01T08:00:00Z');
  assert.throws(() => parseBingNewsHtml('<title>Verify you are human</title>'), /search_challenge/);
});
test('Bing news feed returns publisher URLs, explicit dates and attribution; malformed or unsafe input is excluded', () => {
  const date = new Date().toUTCString();
  const results = parseBingNewsRss(feed(feedItem('https://press.example/story?utm_source=bing', 'A report', date) + feedItem('http://127.0.0.1/private', 'Private', date)));
  assert.equal(results[0].url, 'https://press.example/story?utm_source=bing');
  assert.equal(results[0].publishedAt, new Date(date).toISOString());
  assert.equal(results[0].sourceName, 'Public News'); assert.equal(results[0].snippet, 'Article excerpt');
  assert.throws(() => parseBingNewsRss('<html>not a feed</html>'), /search_unavailable/);
  assert.throws(() => parseBingNewsRss('<!DOCTYPE rss [<!ENTITY x "text">]><rss><channel/></rss>'), /search_unavailable/);
});
test('news category and native time range reach SearXNG and Bing; dates are independently checked and ordinary web search is never used', async () => {
  const urls: string[] = [];
  const recent = new Date(Date.now() - 3600_000).toUTCString();
  const old = new Date(Date.now() - 40 * 86400_000).toUTCString();
  const rss = feed(feedItem('https://press.example/current', 'Current', recent) + feedItem('https://press.example/old', 'Old', old) + feedItem('http://127.0.0.1/private', 'Private', recent));
  const result = await searchFreeWeb('event', 10, { category: 'news', timeRange: 'week', searxngUrl: 'https://search.example', request: async url => { urls.push(String(url)); return String(url).includes('search.example') ? reply('{"results":[]}') : reply(rss); } });
  assert.equal(new URL(urls[0]).searchParams.get('categories'), 'news'); assert.equal(new URL(urls[0]).searchParams.get('time_range'), 'week');
  assert.equal(new URL(urls[1]).pathname, '/news/search'); assert.equal(new URL(urls[1]).searchParams.get('qft'), 'interval="8"'); assert.equal(result.sources[0].provider, 'bing');
  assert.equal(new URL(urls[1]).searchParams.get('format'), 'rss');
  assert.deepEqual(result.sources.map(item => item.title), ['Current']);
  const onlyNews: string[] = [];
  assert.deepEqual((await searchFreeWeb('event', 10, { category: 'news', searxngUrl: '', request: async url => { onlyNews.push(String(url)); return reply(feed('')); } })).sources, []);
  assert.equal(onlyNews.length, 2); assert.ok(onlyNews.every(url => new URL(url).pathname === '/news/search'));
  await assert.rejects(searchFreeWeb('event', 10, { category: 'news', searxngUrl: '', request: async () => reply('upstream error') }), /search_unavailable/);
});
test('news search combines indexes, deduplicates tracking links, and falls back from a broken feed to Bing news cards', async () => {
  const now = new Date().toUTCString();
  const urls: string[] = [];
  const result = await searchFreeWeb('event', 10, { category: 'news', searxngUrl: 'https://search.example', request: async url => {
    urls.push(String(url));
    if (String(url).includes('search.example')) return reply(JSON.stringify({ results: [{ title: 'SearX report', url: 'https://press.example/one?utm_source=x' }, { title: 'Second', url: 'https://press.example/two' }] }));
    return reply(feed(feedItem('https://press.example/one', 'Duplicate', now) + feedItem('https://press.example/three', 'Third', now)));
  } });
  assert.deepEqual(result.sources.map(item => item.title), ['SearX report', 'Second', 'Third']);
  assert.equal(urls.length, 2);
  const fallback = await searchFreeWeb('event', 10, { category: 'news', searxngUrl: '', request: async url => new URL(url).searchParams.has('format') ? reply('<html>bad feed</html>') : reply(html) });
  assert.equal(fallback.sources[0].title, 'An event & evidence');
});
test('per-tab search handoff restores results/selection, expires, and rejects poisoned links', () => {
  const draft = { query: 'event', provider: 'free' as const, period: 'any' as const, result: null, pending: article };
  const encoded = encodeNewsSearchDraft(draft, 1000);
  assert.deepEqual(decodeNewsSearchDraft(encoded, 1001), draft);
  assert.equal(decodeNewsSearchDraft(encoded, 1000 + 30 * 60_000), null);
  assert.equal(decodeNewsSearchDraft(encodeNewsSearchDraft({ ...draft, pending: { ...article, url: 'javascript:alert(1)' } }), Date.now()), null);
  assert.equal(decodeNewsSearchDraft('not json'), null);
  const result = { articles: [article], requestedProvider: 'free', providers: ['bing'], searchedAt: new Date().toISOString(), cached: false, webFallback: false, timeFilterApplied: false };
  assert.ok(decodeNewsSearchDraft(JSON.stringify({ ...draft, result, savedAt: Date.now() })));
  assert.equal(decodeNewsSearchDraft(JSON.stringify({ ...draft, result: { ...result, webFallback: true }, savedAt: Date.now() }))?.result, null);
  assert.equal(decodeNewsSearchDraft(JSON.stringify({ ...draft, result: { ...result, providers: [{}] }, savedAt: Date.now() })), null);
});

test('article source URL follows original-text privacy in public reports', () => {
  const audit = { isSourcePublic: false, auditResultJson: JSON.stringify({ meta: { sourceUrl: 'https://news.example/private?token=secret' } }) };
  assert.equal(JSON.parse(publicAuditDto(audit).auditResultJson).meta.sourceUrl, undefined);
  assert.ok(JSON.parse(ownerAuditDto(audit).auditResultJson).meta.sourceUrl);
  assert.ok(JSON.parse(publicAuditDto({ ...audit, isSourcePublic: true }).auditResultJson).meta.sourceUrl);
});

test('standalone news search records search costs without inventing missing model/token costs', () => {
  const cost = usageCostBreakdown({ usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, nativeSearchRequests: 0 }, searchCounts: { deepseek: 1 }, fallbackSearchCount: 0, rates: {}, searchOnly: true });
  assert.equal(cost.estimatedSearchCostMicros, 750); assert.equal(cost.costCoverage, 'recorded_components');
  assert.equal(cost.details.scope, 'search_only_estimate'); assert.deepEqual(cost.details.missing, []);
});

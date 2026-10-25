import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNewsQuery, normalizeNewsArticles, newsDate, newsUrl, encodeNewsSearchDraft, decodeNewsSearchDraft } from '../lib/news-search-core';
import { parseBingNewsHtml, searchFreeWeb } from '../lib/free-web-search';
import type { NewsArticle } from '../lib/news-search-types';
import { publicAuditDto, ownerAuditDto } from '../lib/audit-dto';
import { usageCostBreakdown } from '../lib/usage-cost';

const article: NewsArticle = { title: 'Event report', url: 'https://news.example/report', snippet: 'Search excerpt', source: 'News', provider: 'bing', publishedAt: null };
const html = '<div class="news-card"><a class="title" data-author="Public News" href="https://news.example/story?utm_source=bing">An event &amp; evidence</a><div class="snippet">A reported event</div><time datetime="2026-01-01T08:00:00Z"></time></div>';
const reply = (body: string) => ({ status: 200, headers: new Headers(), body: Buffer.from(body) });
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
test('news category and native time range reach SearXNG and Bing; general-web fallback cannot silently drop date filters', async () => {
  const urls: string[] = [];
  const result = await searchFreeWeb('event', 10, { category: 'news', timeRange: 'week', searxngUrl: 'https://search.example', request: async url => { urls.push(String(url)); return String(url).includes('search.example') ? reply('{"results":[]}') : reply(html); } });
  assert.equal(new URL(urls[0]).searchParams.get('categories'), 'news'); assert.equal(new URL(urls[0]).searchParams.get('time_range'), 'week');
  assert.equal(new URL(urls[1]).pathname, '/news/search'); assert.equal(new URL(urls[1]).searchParams.get('qft'), 'interval="8"'); assert.equal(result.sources[0].provider, 'bing');
  const onlyNews: string[] = [];
  assert.deepEqual((await searchFreeWeb('event', 10, { category: 'news', timeRange: 'day', searxngUrl: '', request: async url => { onlyNews.push(String(url)); return reply('no results'); } })).sources, []);
  assert.equal(onlyNews.length, 1); assert.ok(onlyNews.every(url => url.includes('/news/search')));
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

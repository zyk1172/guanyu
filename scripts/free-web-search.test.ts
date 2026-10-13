import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFreeSearchHtml, searchFreeWeb, FreeSearchError, resultUrl } from '../lib/free-web-search';
import { searchWeb } from '../lib/search';
import { WebResearchSession } from '../lib/web-research';
import { paidSearchAllowed, customWebResearchEnabled, effectiveSearchMode } from '../lib/web-search-policy';
import { usageCostBreakdown } from '../lib/usage-cost';
import { safeOutboundRequest } from '../lib/safe-outbound';

const reply = (body: string, status = 200, headers: Record<string, string> = {}) => ({ status, headers: new Headers(headers), body: Buffer.from(body) });
const BING = '<ol id="b_results"><li class="b_algo"><h2><a href="https://official.example/report">Official report</a></h2><div class="b_caption"><p>Primary evidence</p></div></li></ol>';
const SX = JSON.stringify({ results: [{ title: 'Official report', url: 'https://official.example/report', content: '<b>Evidence</b>' }] });

test('free policy is the default, native modes use tools, offline mode stays disabled', () => {
  const paid = process.env.GUANYU_ALLOW_PAID_SEARCH; const custom = process.env.GUANYU_CUSTOM_WEB_RESEARCH;
  try {
    delete process.env.GUANYU_ALLOW_PAID_SEARCH; delete process.env.GUANYU_CUSTOM_WEB_RESEARCH;
    assert.equal(paidSearchAllowed(), false); assert.equal(customWebResearchEnabled(), true);
    assert.equal(effectiveSearchMode('native'), 'agent'); assert.equal(effectiveSearchMode('none'), 'none');
    process.env.GUANYU_ALLOW_PAID_SEARCH = 'true'; assert.equal(effectiveSearchMode('native'), 'native');
    process.env.GUANYU_CUSTOM_WEB_RESEARCH = 'false'; assert.equal(customWebResearchEnabled(), false);
  } finally {
    if (paid === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = paid;
    if (custom === undefined) delete process.env.GUANYU_CUSTOM_WEB_RESEARCH; else process.env.GUANYU_CUSTOM_WEB_RESEARCH = custom;
  }
});

test('Bing links decode once, preserve path case, deduplicate and exclude advertisements and invalid links', () => {
  const target = 'https://example.com/Case?q=100%25';
  const encoded = Buffer.from(target).toString('base64url');
  const block = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${encoded}">Result</a></h2><div class="b_caption"><p>Evidence</p></div></li>`;
  const result = parseFreeSearchHtml(`<ol id="b_results">${block}${block}<li class="b_ad"><h2><a href="https://ad.example">Ad</a></h2></li><li class="b_algo"><h2><a href="javascript:alert(1)">Bad</a></h2></li></ol>`, 'https://www.bing.com', 'bing');
  assert.deepEqual(result, [{ title: 'Result', url: target, snippet: 'Evidence', provider: 'bing' }]);
  assert.equal(resultUrl(`https://example.com/${'x'.repeat(2048)}`, 'https://example.com'), null);
  assert.equal(resultUrl('https://user:password@example.com', 'https://example.com'), null);
});

test('DuckDuckGo Lite supports paired snippets and malformed links cannot discard valid results', () => {
  const html = '<table><tr><td><a class="result-link" href="http://[invalid">Bad</a></td></tr><tr><td><a class="result-link" href="https://example.com/report">Report</a></td></tr><tr><td class="result-snippet">Measured evidence</td></tr></table>';
  assert.deepEqual(parseFreeSearchHtml(html, 'https://lite.duckduckgo.com', 'duckduckgo'), [{ title: 'Report', url: 'https://example.com/report', snippet: 'Measured evidence', provider: 'duckduckgo' }]);
});

test('unavailable, empty or malformed SearXNG falls back to Bing with actual request counts', async () => {
  for (const bad of [reply('', 503), reply('{"results":[]}'), reply('{"unresponsive_engines":["google"]}'), reply('invalid json')]) {
    const requests: string[] = []; const counts: string[] = [];
    const result = await searchFreeWeb(' public evidence ', 3, { searxngUrl: 'https://search.example/base', locale: 'zh-CN', onRequest: p => counts.push(p), request: async url => { requests.push(String(url)); return String(url).startsWith('https://search.example/') ? bad : reply(BING); } });
    assert.deepEqual(counts, ['searxng', 'bing']); assert.equal(result.sources[0].provider, 'bing');
    const first = new URL(requests[0]); assert.equal(first.pathname, '/base/search'); assert.equal(first.searchParams.get('language'), 'zh-CN');
    assert.deepEqual(result.attempts.map(a => a.provider), ['searxng', 'bing']);
  }
});

test('a configured SearXNG result prevents unnecessary fallback and normalizes markup', async () => {
  const result = await searchFreeWeb('evidence', 5, { searxngUrl: 'https://search.example', request: async url => { assert.match(String(url), /^https:\/\/search\.example/); return reply(SX); } });
  assert.equal(result.sources[0].snippet, 'Evidence'); assert.deepEqual(result.attempts, [{ provider: 'searxng', outcome: 'results' }]);
});

test('site queries filter unrelated domains and paths before deciding whether to fall back', async () => {
  const result = await searchFreeWeb('site:github.com/mozilla/readability official source', 1, { searxngUrl: 'https://search.example', request: async url => String(url).includes('search.example')
    ? reply('{"results":[{"title":"Other Mozilla page","url":"https://mozilla.org/"}]}')
    : reply('<ol id="b_results"><li class="b_algo"><h2><a href="https://github.com/other/repo">Other</a></h2></li><li class="b_algo"><h2><a href="https://github.com/mozilla/readability">Source</a></h2></li></ol>') });
  assert.equal(result.sources[0].url, 'https://github.com/mozilla/readability');
  assert.deepEqual(result.attempts.map(a => a.outcome), ['empty', 'results']);
});

test('challenge pages fall back across engines without CAPTCHA solving; exhausted chains return diagnostic errors', async () => {
  const calls: string[] = [];
  const result = await searchFreeWeb('evidence', 5, { searxngUrl: '', request: async url => { calls.push(String(url)); return String(url).includes('bing.com') ? reply('<div id="b_captcha"></div>') : reply('<div class="result"><a class="result__a" href="https://example.com">Evidence</a></div>'); } });
  assert.equal(result.sources[0].provider, 'duckduckgo'); assert.equal(calls.length, 2);
  await assert.rejects(searchFreeWeb('evidence', 5, { searxngUrl: '', request: async () => reply('<form id="challenge-form"></form>', 202) }), error => error instanceof FreeSearchError && error.message === 'search_challenge' && error.attempts.length === 3);
});

test('fixed search ignores paid credentials by default and never invokes the paid fetch transport', async () => {
  const prior = process.env.GUANYU_ALLOW_PAID_SEARCH; const originalFetch = globalThis.fetch;
  try {
    delete process.env.GUANYU_ALLOW_PAID_SEARCH;
    globalThis.fetch = async () => { throw new Error('Paid transport must not run'); };
    const counts: string[] = [];
    const results = await searchWeb('evidence', 5, { provider: 'multi', tavilyApiKey: 'saved-key', serperApiKey: 'saved-key', onRequest: p => counts.push(p), freeSearchOptions: { searxngUrl: '', request: async () => reply(BING) } });
    assert.equal(results[0].provider, 'bing'); assert.deepEqual(counts, ['bing']);
    assert.deepEqual(await searchWeb('evidence', 5, { provider: 'none', freeSearchOptions: { request: async () => { throw new Error('Offline must not run'); } } }), []);
  } finally { globalThis.fetch = originalFetch; if (prior === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = prior; }
});

test('agent tools stay free even after paid search is explicitly enabled and whitespace cache avoids repeat requests', async () => {
  const prior = process.env.GUANYU_ALLOW_PAID_SEARCH;
  try {
    process.env.GUANYU_ALLOW_PAID_SEARCH = 'true';
    const session = new WebResearchSession({ searxngUrl: '', searchOptions: { provider: 'multi', tavilyApiKey: 'key', serperApiKey: 'key' }, request: async url => { assert.match(String(url), /^https:\/\/www.bing.com/); return reply(BING); } });
    assert.equal((await session.execute('web_search', { query: 'public   evidence' })).ok, true);
    assert.equal((await session.execute('web_search', { query: 'public evidence' })).ok, true);
    assert.equal(session.searchRequests, 1);
  } finally { if (prior === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = prior; }
});

test('private SearXNG redirect permission does not propagate off-origin and public fallback retains URL protection', async () => {
  const flags: boolean[] = [];
  const result = await searchFreeWeb('evidence', 5, { searxngUrl: 'http://searxng:8080', allowPrivateSearxng: true, request: async (url, options) => {
    flags.push(!!options?.allowPrivateAddress);
    if (String(url).includes('searxng:8080')) return reply('', 302, { location: 'http://127.0.0.1/private' });
    if (String(url).includes('127.0.0.1')) return safeOutboundRequest(url, options);
    return reply(BING);
  } });
  assert.equal(result.sources[0].provider, 'bing'); assert.deepEqual(flags, [true, false, false]);
});

test('expired deadlines prevent network work, all-empty chains fail, and free requests have zero API cost without paid-price assumptions', async () => {
  await assert.rejects(searchFreeWeb('evidence', 5, { deadline: Date.now() - 1, request: async () => { throw new Error('Must not run'); } }), FreeSearchError);
  await assert.rejects(searchFreeWeb('evidence', 5, { searxngUrl: '', request: async () => reply('<html>No results</html>') }), FreeSearchError);
  const cost = usageCostBreakdown({ usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, nativeSearchRequests: 0 }, searchCounts: { bing: 1, duckduckgo: 2, searxng: 1 }, fallbackSearchCount: 0, rates: {} });
  assert.equal(cost.estimatedSearchCostMicros, 0); assert.equal(cost.searchRequestCount, 4);
  assert.ok(!cost.details.missing.some(item => item.startsWith('search_price:')));
  assert.ok(cost.details.missing.includes('external_model_pricing'));
});

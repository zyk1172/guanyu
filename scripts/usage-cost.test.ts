import assert from 'node:assert/strict';
import test from 'node:test';
import { searchUnitRates, usageCostBreakdown } from '../lib/usage-cost';
import type { PlatformModelSnapshot } from '../lib/platform-models';
import { searchWeb } from '../lib/search';
import { WebResearchSession } from '../lib/web-research';

const snapshot = { inputPriceMicrosPerMillion: 100, outputPriceMicrosPerMillion: 200, nativeSearchPriceMicrosPerRequest: 300 } as PlatformModelSnapshot;
const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, nativeSearchRequests: 1 };

test('missing and invalid search pricing is unknown, while explicit zero is a configured price', () => {
  assert.deepEqual(searchUnitRates('invalid'), {});
  assert.deepEqual(searchUnitRates('{"serper":-1,"searxng":0,"tavily_basic":"12"}'), { searxng: 0 });
  const partial = usageCostBreakdown({ snapshot, usage, searchCounts: { serper: 2, searxng: 1 }, fallbackSearchCount: 0, rates: { searxng: 0 } });
  assert.equal(partial.costCoverage, 'partial');
  assert.deepEqual(partial.details.missing, ['search_price:serper']);
  const complete = usageCostBreakdown({ snapshot, usage, searchCounts: { serper: 2, searxng: 1 }, fallbackSearchCount: 0, rates: { serper: 5000, searxng: 0 } });
  assert.equal(complete.costCoverage, 'recorded_components');
  assert.equal(complete.estimatedSearchCostMicros, 10000);
  assert.equal(complete.searchRequestCount, 3);
});

test('missing usage, provider counts, cache prices and excessive costs remain incomplete', () => {
  const result = usageCostBreakdown({ usage: { ...usage, inputTokens: 0, outputTokens: 0, cacheReadTokens: 3 }, fallbackSearchCount: 2, rates: {} });
  assert.ok(result.details.missing.includes('search_provider_usage'));
  assert.ok(result.details.missing.includes('token_usage'));
  assert.ok(result.details.missing.includes('cache_token_pricing'));
  const tooLarge = usageCostBreakdown({ snapshot, usage, searchCounts: { serper: 3 }, fallbackSearchCount: 0, rates: { serper: 2_000_000_000 } });
  assert.equal(tooLarge.estimatedSearchCostMicros, null);
  assert.equal(tooLarge.costCoverage, 'partial');
});

test('failed multi-engine requests are counted, while absent credentials cause no request', async () => {
  const originalFetch = globalThis.fetch;
  const originalPolicy = process.env.GUANYU_ALLOW_PAID_SEARCH;
  process.env.GUANYU_ALLOW_PAID_SEARCH = 'true';
  const calls: string[] = [];
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  try {
    await searchWeb('test', 3, { provider: 'multi', tavilyApiKey: 'fixture', tavilySearchDepth: 'advanced', serperApiKey: 'fixture', onRequest: (provider) => calls.push(provider) });
    assert.deepEqual(calls.sort(), ['serper', 'tavily_advanced']);
    calls.length = 0;
    await searchWeb('test', 3, { provider: 'multi', onRequest: (provider) => calls.push(provider) });
    assert.deepEqual(calls, []);
  } finally { globalThis.fetch = originalFetch; if (originalPolicy === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = originalPolicy; }
});

test('cached agent searches do not add external request charges', async () => {
  const calls: string[] = [];
  const session = new WebResearchSession({ searxngUrl: 'https://search.example', searchOptions: { onRequest: (provider) => calls.push(provider) }, request: async () => ({ status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: Buffer.from('{"results":[{"title":"Evidence","url":"https://evidence.example/news"}]}') }) });
  await session.execute('web_search', { query: 'evidence' });
  await session.execute('web_search', { query: 'evidence' });
  assert.deepEqual(calls, ['searxng']);
});

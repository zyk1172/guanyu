import assert from 'node:assert/strict';
import test from 'node:test';
import { searchDeepseek, normalizeDeepseekSearchResponse, DEEPSEEK_SEARCH_ENDPOINT } from '../lib/deepseek-search';
import { searchWeb } from '../lib/search';
import { WebResearchSession } from '../lib/web-research';
import { usageCostBreakdown } from '../lib/usage-cost';
import { deepseekSettingsUpdate } from '../lib/deepseek-settings';
import { decryptSecret } from '../lib/secret';
import { decodePlatformModelSnapshot, encodePlatformModelSnapshot, safeAdminPlatformModel } from '../lib/platform-models';
import type { PlatformModelConfig } from '../lib/generated/prisma/client';

async function paid<T>(run: () => Promise<T>) {
  const previous = process.env.GUANYU_ALLOW_PAID_SEARCH;
  process.env.GUANYU_ALLOW_PAID_SEARCH = 'true';
  try { return await run(); } finally { if (previous === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = previous; }
}
const result = { title: 'Evidence', url: 'https://evidence.example/news', summary: 'A detailed summary', snippet: 'Short snippet' };

test('DeepSeek sends the documented request to the fixed endpoint, with Unicode query limits and bounded results', async () => {
  const counts: string[] = [];
  const sources = await searchDeepseek('😀'.repeat(150), 5, { apiKey: 'fixture-only-key', onRequest: p => counts.push(p), fetch: async (url, init) => {
    assert.equal(url, DEEPSEEK_SEARCH_ENDPOINT);
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-only-key');
    const body = JSON.parse(String(init?.body));
    assert.equal(Array.from(body.query).length, 128);
    assert.deepEqual({ count: body.count, need_content: body.need_content }, { count: 5, need_content: false });
    return Response.json({ results: [result, { ...result, url: result.url + '#duplicate' }, { ...result, url: 'javascript:alert(1)' }, { ...result, url: 'https://user:password@example.com' }] });
  } });
  assert.deepEqual(sources, [{ title: 'Evidence', url: result.url, snippet: result.summary, provider: 'deepseek' }]);
  assert.deepEqual(counts, ['deepseek']);
  assert.deepEqual(normalizeDeepseekSearchResponse({ results: [null, {}, { url: 'https://safe.example', snippet: 'fallback' }] }), [{ title: 'safe.example', url: 'https://safe.example/', snippet: 'fallback', provider: 'deepseek' }]);
});

test('only non-empty HTTP 200 search responses are billable; errors never expose upstream secrets', async () => {
  const counts: string[] = [];
  for (const status of [401, 402, 429, 500]) {
    await assert.rejects(searchDeepseek('evidence', 5, { apiKey: 'private-fixture', onRequest: p => counts.push(p), fetch: async () => new Response('private-fixture', { status }) }), /^Error: deepseek_search_unavailable$/);
  }
  assert.deepEqual(await searchDeepseek('nothing', 5, { apiKey: 'fixture', onRequest: p => counts.push(p), fetch: async () => Response.json({ results: [] }) }), []);
  assert.deepEqual(counts, Array(5).fill('deepseek_unbilled'));
  await searchDeepseek('no key', 5, { fetch: async () => { throw new Error('must not call'); }, onRequest: () => assert.fail('no request without key') });
  const cost = usageCostBreakdown({ usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, nativeSearchRequests: 0 }, searchCounts: { deepseek: 2, deepseek_unbilled: 5 }, fallbackSearchCount: 0, rates: { deepseek_unbilled: 12345 } });
  assert.equal(cost.estimatedSearchCostMicros, 1500);
  assert.equal(cost.searchRequestCount, 7);
});

test('agent web_search uses DeepSeek, caches responses, records charges once, and keeps webpage reads on the safe free transport', async () => paid(async () => {
  let apiCalls = 0, reads = 0;
  const session = new WebResearchSession({ searchOptions: { provider: 'deepseek', deepseekApiKey: 'fixture', deepseekFetch: async () => { apiCalls++; return Response.json({ results: [result] }); } }, request: async () => { reads++; return { status: 200, headers: new Headers({ 'content-type': 'text/plain' }), body: Buffer.from('Retrieved primary evidence') }; } });
  assert.equal((await session.execute('web_search', { query: 'evidence' })).ok, true);
  await session.execute('web_search', { query: 'evidence' });
  const page = await session.execute('read_webpage', { url: result.url });
  assert.equal(page.content, 'Retrieved primary evidence');
  assert.equal(apiCalls, 1); assert.equal(session.searchRequests, 1); assert.equal(reads, 1);
  assert.equal(session.sources[0].provider, 'webpage');
  const failed = new WebResearchSession({ searchOptions: { provider: 'deepseek', deepseekApiKey: 'private-fixture', deepseekFetch: async () => { throw new Error('private-fixture'); } } });
  assert.deepEqual(await failed.execute('web_search', { query: 'x' }), { ok: false, untrusted: true, error: 'deepseek_search_unavailable' });
}));

test('deployment opt-out blocks saved DeepSeek keys in fixed and agent searches', async () => {
  const previous = process.env.GUANYU_ALLOW_PAID_SEARCH;
  process.env.GUANYU_ALLOW_PAID_SEARCH = 'false';
  let paidCalls = 0;
  const transport = async () => ({ status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: Buffer.from(JSON.stringify({ results: [result] })) });
  try {
    const options = { provider: 'deepseek' as const, deepseekApiKey: 'fixture', deepseekFetch: async () => { paidCalls++; return Response.json({ results: [] }); } };
    const sources = await searchWeb('evidence', 5, { ...options, freeSearchOptions: { searxngUrl: 'https://search.example', request: transport } });
    assert.equal(sources.length, 1);
    const agent = new WebResearchSession({ searchOptions: options, searxngUrl: 'https://search.example', request: transport });
    assert.equal((await agent.execute('web_search', { query: 'evidence' })).ok, true);
    assert.equal(paidCalls, 0);
  } finally { if (previous === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = previous; }
});

test('settings encrypt keys, preserve blank edits, require valid keys, and clear explicitly', () => {
  const previous = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = 'deepseek-test-encryption-key';
  try {
    const saved = deepseekSettingsUpdate({ searchProvider: 'deepseek', deepseekApiKey: ' fixture-only-key ' });
    assert.equal(decryptSecret(saved.deepseekApiKeyEncrypted), 'fixture-only-key');
    assert.ok(!String(saved.deepseekApiKeyEncrypted).includes('fixture-only-key'));
    assert.deepEqual(deepseekSettingsUpdate({ deepseekApiKey: '' }, saved), {});
    assert.deepEqual(deepseekSettingsUpdate({ searchProvider: 'free', clearDeepseekApiKey: true }, saved), { searchProvider: 'free', deepseekApiKeyEncrypted: null });
    assert.throws(() => deepseekSettingsUpdate({ searchProvider: 'deepseek' }), /API Key/);
    assert.throws(() => deepseekSettingsUpdate({ searchProvider: 'unknown' }), /搜索来源/);
    assert.throws(() => deepseekSettingsUpdate({ deepseekApiKey: 123 }), /格式/);
    const safe = safeAdminPlatformModel({ ...saved, apiKeyEncrypted: 'model-ciphertext' } as PlatformModelConfig);
    assert.equal('apiKeyEncrypted' in safe, false); assert.equal('deepseekApiKeyEncrypted' in safe, false); assert.equal(safe.hasDeepseekApiKey, true);
    const snapshot = decodePlatformModelSnapshot(JSON.stringify({ configId: 'fixture', modelId: 'test', baseUrl: 'https://model.example', provider: 'openai_compatible', searchProvider: 'deepseek', deepseekApiKeyEncrypted: 'must-not-copy' }));
    assert.ok(snapshot); assert.equal(snapshot.searchProvider, 'deepseek'); assert.ok(!encodePlatformModelSnapshot(snapshot).includes('must-not-copy'));
  } finally { if (previous === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previous; }
});

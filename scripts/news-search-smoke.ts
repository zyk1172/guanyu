import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { getOrCreateAppSetting } from '../lib/billing';
import { cacheDel, CACHE_KEYS } from '../lib/cache';
import { encryptSecret } from '../lib/secret';
import { privacyHmacHash } from '../lib/privacy-hash';
import { resolveNewsSearchAccess } from '../lib/news-search-settings';
import { runNewsSearch, type NewsSearchInput } from '../lib/news-search-service';
import { GET as capabilities, POST as searchRoute } from '../app/api/news/search/route';
import { GET as adminGet, PATCH as adminPatch } from '../app/api/admin/news-search/route';

const suffix = crypto.randomUUID(), start = new Date(), base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const app = await getOrCreateAppSetting(); const oldPaid = process.env.GUANYU_ALLOW_PAID_SEARCH;
const users: string[] = [], keys = new Set<string>(); let modelId: string | undefined;
const input: NewsSearchInput = { query: `fixture ${suffix}`, provider: 'free', period: 'any', language: 'zh-CN' };
const transport = async (url: string | URL) => String(url).includes('fixture.example')
  ? ({ status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ results: [{ title: 'Fictional public report', url: 'https://news.example/fixture', content: 'Fixture only, not real news.', publishedDate: '2026-01-01' }] })) })
  : ({ status: 503, headers: new Headers(), body: Buffer.from('unavailable') });
const options = { freeOptions: { searxngUrl: 'https://fixture.example', request: transport } };
function track(i: NewsSearchInput, a: Awaited<ReturnType<typeof resolveNewsSearchAccess>>) {
  const scope = i.provider === 'deepseek' ? `${a.scope}:${privacyHmacHash(a.encryptedKey!)}` : 'public';
  keys.add(privacyHmacHash(JSON.stringify(['news-v3', scope, i.provider, i.period, i.language, i.query])));
}
async function request(path: string, userId?: string, method = 'GET', body?: unknown, origin = new URL(base).origin) {
  const token = userId ? await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: userId, sessionVersion: 1 } }) : '';
  return new NextRequest(new URL(path, base), { method, headers: { origin, ...(token ? { cookie: `next-auth.session-token=${token}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
try {
  for (const [role, pro] of [['user', false], ['user', true], ['super_admin', false]] as const) {
    const user = await prisma.user.create({ data: { email: `news-${users.length}-${suffix}@example.test`, password: '!passwordless', role, ...(pro ? { proAccessExpiresAt: new Date(Date.now() + 86400_000) } : {}), settings: { create: { deepseekApiKeyEncrypted: encryptSecret('personal-fixture-key') } } } }); users.push(user.id);
  }
  const model = await prisma.platformModelConfig.create({ data: { configKey: `news-${suffix}`, displayName: 'Search fixture', baseUrl: 'https://model.example', modelId: 'fixture', deepseekApiKeyEncrypted: encryptSecret('platform-fixture-key') } }); modelId = model.id;
  process.env.GUANYU_ALLOW_PAID_SEARCH = 'true';
  const patch = { provider: 'deepseek', modelConfigId: model.id, dailyLimit: 1 };
  assert.equal((await adminPatch(await request('/api/admin/news-search', users[0], 'PATCH', patch))).status, 403);
  assert.equal((await adminPatch(await request('/api/admin/news-search', users[2], 'PATCH', patch, 'https://evil.example'))).status, 403);
  assert.equal((await adminPatch(await request('/api/admin/news-search', users[2], 'PATCH', patch))).status, 200);
  const pub = await capabilities(await request('/api/news/search')); const pubText = await pub.text(); assert.ok(!pubText.includes('fixture-key')); assert.equal(JSON.parse(pubText).deepseekAvailable, false);
  const ordinary = await resolveNewsSearchAccess({ id: users[0], sessionVersion: 1 }); const pro = await resolveNewsSearchAccess({ id: users[1], sessionVersion: 1 });
  assert.equal(ordinary.capabilities.deepseekSource, 'platform'); assert.equal(pro.capabilities.deepseekSource, 'personal');
  const adminResponse = await adminGet(await request('/api/admin/news-search', users[2])); assert.equal(adminResponse.status, 200); assert.ok(!(await adminResponse.text()).includes('fixture-key'));
  assert.equal((await searchRoute(await request('/api/news/search', undefined, 'POST', { ...input, provider: 'deepseek' }))).status, 403);
  assert.equal((await searchRoute(await request('/api/news/search', undefined, 'POST', { ...input, query: 'a' }))).status, 400);
  assert.equal((await searchRoute(await request('/api/news/search', undefined, 'POST', input, 'https://evil.example'))).status, 403);
  const proxyEnv = { node: process.env.NODE_ENV, vercel: process.env.VERCEL, trust: process.env.TRUST_PROXY_HEADERS };
  const mutableEnv = process.env as Record<string, string | undefined>;
  try {
    mutableEnv.NODE_ENV = 'production'; delete process.env.VERCEL; delete process.env.TRUST_PROXY_HEADERS;
    const missingProxy = await searchRoute(await request('/api/news/search', undefined, 'POST', input));
    assert.equal(missingProxy.status, 503); assert.match((await missingProxy.json()).error, /配置不完整/);
  } finally {
    if (proxyEnv.node === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = proxyEnv.node;
    if (proxyEnv.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = proxyEnv.vercel;
    if (proxyEnv.trust === undefined) delete process.env.TRUST_PROXY_HEADERS; else process.env.TRUST_PROXY_HEADERS = proxyEnv.trust;
  }

  track(input, ordinary); let calls = 0;
  const first = await runNewsSearch(input, ordinary, users[0], { freeOptions: { ...options.freeOptions, request: async url => { calls++; return transport(url); } } });
  const second = await runNewsSearch(input, ordinary, users[0], { freeOptions: { ...options.freeOptions, request: async () => { throw new Error('cache must avoid outbound work'); } } });
  assert.equal(first.articles.length, 1); assert.equal(second.cached, true); assert.equal(calls, 2);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: { in: users } } }), 0);

  const expanded = { ...input, query: `请查找台风最新动态 ${suffix.slice(0, 8)}` };
  track(expanded, ordinary);
  const queries = new Set<string>();
  const ai = await runNewsSearch(expanded, ordinary, users[0], {
    freeOptions: { ...options.freeOptions, request: async url => {
      const target = new URL(url);
      if (target.hostname !== 'fixture.example') return transport(url);
      const query = target.searchParams.get('q')!;
      queries.add(query);
      const slug = query === expanded.query ? 'original' : 'expanded';
      return { status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ results: [
        { title: slug, url: `https://news.example/${slug}`, publishedDate: '2026-01-01' },
      ] })) };
    } },
    modelInvoke: async ({ system }) => ({
      ok: true, status: 200, usedTokenBudget: false, sources: [],
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, nativeSearchRequests: 0 },
      message: system.startsWith('Extract') ? JSON.stringify({ queries: ['台风 路径 最新通报', 'https://not-a-query.example'] }) : JSON.stringify({ ids: [2] }),
    }),
  });
  assert.deepEqual([...queries].sort(), [expanded.query, '台风 路径 最新通报'].sort());
  assert.deepEqual(ai.searchTerms, ['台风 路径 最新通报']);
  assert.equal(ai.aiRanked, true);
  assert.deepEqual(ai.articles.map(article => article.title), ['expanded', 'original']);
  assert.equal(await prisma.modelUsageEvent.count({ where: { userId: users[0], operation: 'news_search_ai', inputTokens: 20, creditCostCents: 0 } }), 1);

  const paid: NewsSearchInput = { ...input, provider: 'deepseek' }; track(paid, ordinary);
  let upstream = 0;
  const fakeDeepseek: typeof fetch = async (_url, init) => { upstream++; assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer platform-fixture-key'); assert.match(JSON.parse(String(init?.body)).query, /^新闻报道 /); return Response.json({ results: [{ title: 'Fixture', url: 'https://news.example/fixture?utm_source=paid', summary: 'Fictional test material' }, { title: 'Non-news', url: 'https://other.example/blog' }] }); };
  const concurrent = await Promise.allSettled([runNewsSearch(paid, ordinary, users[0], { ...options, deepseekFetch: fakeDeepseek }), runNewsSearch(paid, ordinary, users[0], { ...options, deepseekFetch: fakeDeepseek })]);
  assert.equal(upstream, 1); assert.ok(concurrent.some(item => item.status === 'fulfilled'));
  const repeated = await runNewsSearch(paid, ordinary, users[0], { ...options, deepseekFetch: fakeDeepseek }); assert.equal(repeated.cached, true); assert.equal(upstream, 1); assert.deepEqual(repeated.articles.map(article => article.url), ['https://news.example/fixture']);
  const capped = { ...paid, query: `capped ${suffix}` }; track(capped, ordinary);
  await assert.rejects(runNewsSearch(capped, ordinary, users[0], { ...options, deepseekFetch: fakeDeepseek }), (error: unknown) => (error as { status: number }).status === 429); assert.equal(upstream, 1);
  const noNews = { ...paid, query: `no-news ${suffix}` }; track(noNews, ordinary);
  const empty = await runNewsSearch(noNews, ordinary, users[0], { freeOptions: { searxngUrl: '', request: async () => ({ status: 200, headers: new Headers(), body: Buffer.from('<rss><channel><title>Empty</title></channel></rss>') }) }, deepseekFetch: fakeDeepseek });
  assert.equal(empty.articles.length, 0); assert.equal(upstream, 1);

  track(paid, pro);
  await runNewsSearch(paid, pro, users[1], { ...options, deepseekFetch: async (_url, init) => { assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer personal-fixture-key'); return Response.json({ results: [] }); } });
  const failing = { ...paid, query: `failure ${suffix}` }; track(failing, pro);
  await assert.rejects(runNewsSearch(failing, pro, users[1], { ...options, deepseekFetch: async () => { throw new Error('fixture upstream failure'); } }), (error: unknown) => (error as { status: number }).status === 503);
  assert.equal(await prisma.newsSearchCache.count({ where: { cacheKey: [...keys].at(-1) } }), 0);
  process.env.GUANYU_ALLOW_PAID_SEARCH = 'false';
  const disabled = await resolveNewsSearchAccess({ id: users[1], sessionVersion: 1 }); assert.equal(disabled.capabilities.deepseekAvailable, false);
  await assert.rejects(runNewsSearch(paid, disabled, users[1], { deepseekFetch: fakeDeepseek }), (error: unknown) => (error as { status: number }).status === 403);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: { in: users } } }), 0);
  assert.ok(await prisma.modelUsageEvent.count({ where: { userId: { in: users }, operation: 'news_search', searchRequestCount: { gt: 0 } } }));
  console.log('news search smoke passed: settings/permissions/secrets/personal-platform/free-only/cache/concurrency/caps/usage/no-analysis-charges/failures');
} finally {
  if (oldPaid === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = oldPaid;
  await prisma.appSetting.update({ where: { id: 'global' }, data: { newsSearchProvider: app.newsSearchProvider, newsSearchModelConfigId: app.newsSearchModelConfigId, newsSearchDailyLimit: app.newsSearchDailyLimit } }); await cacheDel(CACHE_KEYS.appSetting);
  await prisma.newsSearchCache.deleteMany({ where: { cacheKey: { in: [...keys] } } });
  await prisma.modelUsageEvent.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (modelId) await prisma.platformModelConfig.deleteMany({ where: { id: modelId } });
  await prisma.verificationCode.deleteMany({ where: { purpose: 'access_attempt', createdAt: { gte: start }, email: { startsWith: 'access:news-' } } });
  await prisma.$disconnect();
}

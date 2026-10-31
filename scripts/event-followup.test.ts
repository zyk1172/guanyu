import assert from 'node:assert/strict';
import test from 'node:test';
import { eventKeywordSeed } from '../lib/event-query';
import { planEventSearch, type ResearchModel } from '../lib/event-search';
import { answerEventFollowup, FOLLOWUP_SCOPE } from '../lib/followup-research';
import { WebResearchSession } from '../lib/web-research';
import type { invokeModel, ModelInvocationResult } from '../lib/model-runtime';
import { groundFollowupLinks } from '../lib/followup-evidence';

const title = '10.30日：皇马就姆巴佩辱华事件公开低头，官网仍用其封面言行不一，中国市场后续承压';
const model: ResearchModel = { provider: 'openai_compatible', baseUrl: 'https://model.example/v1', apiKey: 'fixture-only', modelId: 'fixture', reasoningDepth: 'none' };
const context = { title, originalContent: '用户提供的事件说法尚未核实，不代表事实。', publishedAt: '2026-10-30', question: '姆巴佩具体说了什么？有没有官方回应？' };
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, nativeSearchRequests: 0 };
const result = (message: string, ok = true, status = 200): ModelInvocationResult => ({ ok, status, message, usedTokenBudget: true, sources: [], usage });
const planner = JSON.stringify({ needsSearch: true, queries: ['皇马 姆巴佩 言论', '姆巴佩 官方 声明'] });
const input = { context, model, system: FOLLOWUP_SCOPE, userPrompt: '用户输入与旧报告（未核实资料）', searchEnabled: true, agentTools: false, nativeSearch: false, searchOptions: { provider: 'free' as const } };
const pageText = '【本地虚构测试资料】这是检索到的完整网页文本，用来验证模型收到外部资料，而非只看报告。'.repeat(6);
function researchFixture(mode: 'ok' | 'empty' | 'down' | 'blocked' = 'ok') {
  const requested: string[] = [];
  const session = new WebResearchSession({ searxngUrl: 'https://search.fixture', request: async url => {
    requested.push(url);
    if (mode === 'down') throw new Error('fixture unavailable');
    if (mode === 'empty' && !url.startsWith('https://search.fixture')) return { status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: Buffer.from('<div class="no-results">No results</div>') };
    const body = url.startsWith('https://search.fixture') ? JSON.stringify({ results: mode === 'empty' ? [] : [{ title: '本地虚构测试来源', url: 'https://source.example/event', content: '本地虚构检索摘要，不是关于真实事件的证据。' }] }) : `<html><head><title>本地虚构测试页面</title></head><body><article>${pageText}</article></body></html>`;
    return { status: mode === 'blocked' && !url.startsWith('https://search.fixture') ? 403 : 200, headers: new Headers({ 'content-type': url.startsWith('https://search.fixture') ? 'application/json' : 'text/html' }), body: Buffer.from(body) };
  } });
  return { session, requested };
}
function invocation(handler: (params: Parameters<typeof invokeModel>[0], call: number) => ModelInvocationResult) {
  let calls = 0;
  return { invoke: (async params => handler(params, calls++)) as typeof invokeModel, get calls() { return calls; } };
}

test('long editorial headline becomes a short event seed without date prefix or commentary', () => {
  const seed = eventKeywordSeed(title);
  assert.equal(seed, '皇马 姆巴佩 辱华');
  assert.doesNotMatch(seed, /低头|官网|承压|10.30/);
  assert.ok(eventKeywordSeed('', '事件资料'.repeat(100)).length <= 80);
});

test('planner uses the current question and conversation to resolve event references', async () => {
  const mock = invocation(params => {
    assert.match(params.system, /untrusted DATA/);
    assert.equal(params.reasoningDepth, 'none', 'keyword extraction should not consume the answer model’s deep-thinking budget');
    assert.match(params.system, /NOT a full headline/);
    const payload = JSON.parse(params.userPrompt);
    assert.equal(payload.question, context.question);
    assert.deepEqual(payload.recentConversation, [{ role: 'assistant', content: '前一条回答提到了另一名球员。' }]);
    return result(planner);
  });
  const plan = await planEventSearch({ ...context, history: [{ role: 'assistant', content: '前一条回答提到了另一名球员。' }] }, model, { invoke: mock.invoke });
  assert.deepEqual(plan.queries, ['皇马 姆巴佩 言论', '姆巴佩 官方 声明']);
});

test('failed planning has bounded fallback queries and does not disable factual event questions', async () => {
  const plan = await planEventSearch({ ...context, question: '这篇报告背后发生的事是怎么回事？' }, model, { invoke: invocation(() => result('bad json')).invoke });
  assert.equal(plan.needsSearch, true);
  assert.ok(plan.queries.length >= 1 && plan.queries.every(query => query.length <= 120));
  assert.ok(plan.queries.some(query => !query.includes('2026')));
});

test('an unchanged long headline from a weak planner is replaced by keyword fallbacks', async () => {
  const plan = await planEventSearch(context, model, { invoke: invocation(() => result(JSON.stringify({ needsSearch: true, queries: [title] }))).invoke });
  assert.ok(plan.queries.length);assert.ok(plan.queries.every(query => query !== title && !query.includes('官网')));
});

test('explicit search cannot be silently disabled by the planner; query payloads exclude URLs and secrets', async () => {
  const plan = await planEventSearch(context, model, { forceSearch: true, invoke: invocation(() => result(JSON.stringify({ needsSearch: false, queries: ['https://private.example/token', 'api_key=secret-value'] }))).invoke });
  assert.equal(plan.needsSearch, true);
  assert.ok(plan.queries.length);
  assert.doesNotMatch(plan.queries.join(' '), /private.example|secret-value/);
});

test('platform mode prefetches and reads actual source text even without function calling', async () => {
  const fixture = researchFixture();
  const mock = invocation((params, call) => {
    if (!call) return result(planner);
    assert.match(params.userPrompt, /本地虚构测试资料/);
    assert.match(params.userPrompt, /"kind":"page"/);
    assert.equal(params.webResearch, undefined);
    return result('这是基于本地虚构来源的测试回答。');
  });
  const answer = await answerEventFollowup(input, { invoke: mock.invoke, research: fixture.session });
  assert.equal(answer.research.status, 'searched');
  assert.equal(answer.research.sources[0].kind, 'page');
  assert.deepEqual(answer.research.queries, ['皇马 姆巴佩 言论', '姆巴佩 官方 声明']);
  assert.equal(fixture.session.searchRequests, 2);
  assert.equal(fixture.requested.filter(url => url === 'https://source.example/event').length, 1);
  assert.equal(answer.usage.inputTokens, 20);
});

test('blocked pages remain snippets, not claimed full-text reads', async () => {
  const fixture = researchFixture('blocked');
  const answer = await answerEventFollowup(input, { research: fixture.session, invoke: invocation((_p, call) => result(call ? '没有读到全文，不能确认具体言论。' : planner)).invoke });
  assert.equal(answer.research.sources[0].kind, 'snippet');
});

for (const [mode, status] of [['empty', 'empty'], ['down', 'unavailable']] as const) test(`${mode} search is explicit and never fabricates sources`, async () => {
  const fixture = researchFixture(mode);
  const answer = await answerEventFollowup(input, { research: fixture.session, invoke: invocation((params, call) => {
    if (!call) return result(planner);
    assert.match(params.userPrompt, new RegExp(`"status":"${status}"`));
    return result('没有查到可用资料，不能据此核实事件。');
  }).invoke });
  assert.equal(answer.research.status, status);
  assert.deepEqual(answer.research.sources, []);
});

test('offline policy skips planning, external requests and native or agent tools', async () => {
  const fixture = researchFixture();
  const mock = invocation(params => {
    assert.equal(params.nativeSearch, false); assert.equal(params.webResearch, undefined);
    assert.match(params.userPrompt, /"status":"disabled"/);
    return result('本次未联网。');
  });
  const answer = await answerEventFollowup({ ...input, searchEnabled: false, agentTools: true, nativeSearch: true }, { invoke: mock.invoke, research: fixture.session });
  assert.equal(mock.calls, 1); assert.deepEqual(fixture.requested, []); assert.equal(answer.research.status, 'disabled');
});

test('pure report explanation can avoid external search', async () => {
  const fixture = researchFixture();
  const answer = await answerEventFollowup({ ...input, context: { ...context, question: '解释一下报告评分的含义' } }, { research: fixture.session, invoke: invocation((_p, call) => result(call ? '评分代表证据情况。' : '{"needsSearch":false,"queries":[]}')).invoke });
  assert.equal(answer.research.status, 'not_needed'); assert.deepEqual(fixture.requested, []);
});

test('unsupported function calls fall back to the same selected model with retrieved evidence and cumulative usage', async () => {
  const fixture = researchFixture();
  const mock = invocation((params, call) => {
    if (!call) return result(planner);
    assert.equal(params.modelId, model.modelId); assert.match(params.userPrompt, /本地虚构测试资料/);
    if (call === 1) { assert.ok(params.webResearch); return result('', false, 400); }
    assert.equal(params.webResearch, undefined); return result('模型不支持函数调用，但已依据实际检索内容回答。');
  });
  const answer = await answerEventFollowup({ ...input, agentTools: true }, { invoke: mock.invoke, research: fixture.session });
  assert.equal(answer.ok, true); assert.equal(mock.calls, 3); assert.equal(answer.usage.inputTokens, 30);
});

test('researched answer links are grounded in actual returned sources', () => {
  const research = { status: 'searched' as const, queries: ['事件 关键词'], searchedAt: '2026-10-31T00:00:00Z', sources: [{ title: '虚构来源', url: 'https://source.example/event', kind: 'snippet' as const }] };
  const answer = groundFollowupLinks('[实际来源](https://source.example/event#section) 与 [编造来源](https://invented.example/story)', research);
  assert.match(answer, /\[实际来源\]\(https:\/\/source.example/);
  assert.doesNotMatch(answer, /invented.example/);
});

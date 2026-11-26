import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { encryptSecret } from '../lib/secret';
import { POST } from '../app/api/audits/qa/route';

async function main() {
  let planning = 0, answering = 0, searching = 0;
  let answerMode: 'unsupported' | 'tool_markup' | 'invalid_twice' | 'unavailable' = 'unsupported';
  const toolMarkup = '<｜｜DSML｜｜calls>\n<｜｜DSML｜｜invoke name="read_webpage">https://unread.example/news</｜｜DSML｜｜invoke>';
  const payloads: string[] = [], queries: string[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://fixture');
    const send = (data: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (url.pathname === '/search') {
      searching++; queries.push(url.searchParams.get('q') || '');
      return send({ results: [{ title: '本地虚构测试来源', url: 'https://evidence.fixture.invalid/event', content: '【虚构测试摘要】来源为本地夹具，不能用于判断真实新闻。' }] });
    }
    let body = ''; for await (const chunk of request) body += chunk;
    payloads.push(body);
    const params = JSON.parse(body);
    if (String(params.messages?.[0]?.content).includes('Plan public-web research')) {
      planning++;
      return send({ choices: [{ message: { content: '{"needsSearch":true,"queries":["皇马 姆巴佩 言论","姆巴佩 官方 声明"]}' } }], usage: { prompt_tokens: 20, completion_tokens: 10 } });
    }
    answering++;
    if (answerMode === 'unavailable') return send({ error: 'fixture unavailable' }, 503);
    if (answerMode === 'unsupported' && params.tools) return send({ error: 'fixture does not support function calling' }, 400);
    if (answerMode === 'invalid_twice' && params.tools) {
      return send({ choices: [{ finish_reason: 'tool_calls', message: { content: 'Unfinished response' } }], usage: { prompt_tokens: 30, completion_tokens: 5 } });
    }
    if (answerMode === 'invalid_twice' || (answerMode === 'tool_markup' && params.tools)) {
      return send({ choices: [{ finish_reason: 'stop', message: { content: toolMarkup } }], usage: { prompt_tokens: 30, completion_tokens: 5 } });
    }
    const researched = String(params.messages?.at(-1)?.content).includes('虚构测试摘要');
    return send({ choices: [{ message: { content: researched ? '这是本地夹具检索结果，不是真实新闻结论。[本地来源](https://evidence.fixture.invalid/event)' : '本次依据现有材料回答，没有核实最新事实。' } }], usage: { prompt_tokens: 50, completion_tokens: 20 } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const envNames = ['OPENAI_BASE_URL', 'ALLOW_PRIVATE_ADMIN_LLM', 'WEB_RESEARCH_SEARXNG_URL', 'WEB_RESEARCH_ALLOW_PRIVATE_SEARXNG'] as const;
  const old = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  process.env.OPENAI_BASE_URL = baseUrl; process.env.ALLOW_PRIVATE_ADMIN_LLM = 'true';
  process.env.WEB_RESEARCH_SEARXNG_URL = baseUrl; process.env.WEB_RESEARCH_ALLOW_PRIVATE_SEARXNG = 'true';
  const suffix = crypto.randomUUID(), privateMarker = `PRIVATE_SOURCE_${suffix}`;
  const model = await prisma.platformModelConfig.create({ data: { configKey: `followup-${suffix}`, displayName: 'Local event followup fixture', modelId: 'fixture', baseUrl, apiKeyEncrypted: encryptSecret('local-only-key'), searchMode: 'platform' } });
  const users: string[] = [];
  for (const role of ['owner', 'reader']) {
    const user = await prisma.user.create({ data: { email: `event-${role}-${suffix}@example.test`, password: '!passwordless', creditBalance: 100, creditBalanceCents: 10000, creditBalanceAmount: 100, settings: { create: { defaultPlatformModelConfigId: model.id, modelSource: 'platform' } } } });users.push(user.id);
  }
  try {
    const title = '10.30日：皇马就姆巴佩辱华事件公开低头，官网仍用其封面言行不一，中国市场后续承压';
    const audit = await prisma.audit.create({ data: { userId: users[0], title, source: '虚构本地测试记录，不是事实核查', publishedAt: '2026-10-30', originalContent: privateMarker.repeat(3), newsSummary: '公开摘要仅用于界面和接口测试。', reasoningDepth: 'none', analysisMode: 'deep', modelName: 'fixture', auditResultJson: JSON.stringify({ originalQuote: privateMarker, relatedCoverage: { title: privateMarker } }), isPublic: false, isSourcePublic: false } });
    const cookie = async (id: string) => `next-auth.session-token=${await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id, sessionVersion: 1 } })}`;
    const request = async (id: string | null, requestId = crypto.randomUUID(), webSearch = true, origin = 'http://localhost', chatHistory: { role: string; content: string }[] = []) => POST(new NextRequest('http://localhost/api/audits/qa', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(id ? { cookie: await cookie(id) } : {}) }, body: JSON.stringify({ auditId: audit.id, question: '姆巴佩具体说了什么？能查到相关报道和官方回应吗？', requestId, webSearch, interfaceLanguage: 'zh-CN', chatHistory }) }));
    const balance = async () => (await prisma.user.findUniqueOrThrow({ where: { id: users[0] } })).creditBalanceCents;
    assert.equal((await request(null)).status, 401);
    assert.equal((await request(users[0], crypto.randomUUID(), true, 'https://foreign.example')).status, 403);
    assert.equal((await request(users[1])).status, 403);
    const id = crypto.randomUUID(), response = await request(users[0], id), answer = await response.json();
    assert.equal(response.status, 200, JSON.stringify(answer)); assert.equal(answer.research.status, 'searched');
    assert.equal(answer.research.sources[0].kind, 'snippet', 'a blocked/nonexistent public page is not a full-text read');
    assert.equal(answer.research.queries.length, 2); assert.deepEqual(queries, ['皇马 姆巴佩 言论', '姆巴佩 官方 声明']);
    assert.equal(planning, 1); assert.equal(answering, 1); assert.equal(searching, 2); assert.equal(await balance(), 9900);
    const cached = await request(users[0], id); assert.equal(cached.status, 200);assert.deepEqual((await cached.json()).research, answer.research);
    assert.equal(await balance(), 9900); assert.equal(planning, 1); assert.equal(answering, 1);
    const savedTurn = await prisma.reportFollowup.findFirstOrThrow({
      where: { userId: users[0], reportId: audit.id, reportVersion: audit.reportVersion },
    });
    assert.match(savedTurn.question, /姆巴佩具体说了什么/);
    assert.equal(savedTurn.answer, answer.reply);
    assert.deepEqual(savedTurn.sources, answer.research.sources);
    assert.equal(await prisma.reportFollowup.count({ where: { userId: users[0], reportId: audit.id } }), 1);
    const logged = await prisma.modelUsageEvent.findFirstOrThrow({ where: { userId: users[0], operation: 'followup', status: 'success' } });
    assert.equal(logged.inputTokens, 70); assert.equal(logged.outputTokens, 30); assert.equal(logged.searchRequestCount, 2);
    const legacyOperation = await prisma.serviceOperation.findFirstOrThrow({ where: { userId: users[0], idempotencyKey: `followup:${audit.id}:${id}` } });
    await prisma.serviceOperation.update({ where: { id: legacyOperation.id }, data: { resultJson: JSON.stringify({ reply: toolMarkup }) } });
    const legacy = await request(users[0], id);
    assert.equal(legacy.status, 409);
    assert.doesNotMatch(await legacy.text(), /DSML/);
    assert.equal(await balance(), 9900); assert.equal(answering, 1);
    const before = searching;
    const disabled = await request(users[0], crypto.randomUUID(), false);assert.equal((await disabled.json()).research.status, 'disabled');assert.equal(searching, before);
    await prisma.platformModelConfig.update({ where: { id: model.id }, data: { searchMode: 'none' } });
    const offline = await request(users[0]);assert.equal((await offline.json()).research.status, 'disabled');assert.equal(searching, before);assert.equal(planning, 1);
    await prisma.platformModelConfig.update({ where: { id: model.id }, data: { searchMode: 'agent' } });
    const compatible = await request(users[0]);assert.equal(compatible.status, 200);assert.equal((await compatible.json()).research.sources.length, 1);assert.equal(await balance(), 9600);
    answerMode = 'tool_markup';
    payloads.length = 0;
    const recovered = await request(users[0], crypto.randomUUID(), true, 'http://localhost', [{ role: 'assistant', content: toolMarkup }]);
    assert.equal(recovered.status, 200);
    const recoveredAnswer = await recovered.json();
    assert.match(recoveredAnswer.reply, /本地夹具检索结果/);
    assert.doesNotMatch(JSON.stringify(recoveredAnswer), /DSML|unread\.example/);
    assert.equal(payloads.length, 3, 'one plan, one tool-enabled answer attempt, one plain retry');
    assert.ok(payloads.every(body => !body.includes('DSML')));
    const [, firstAttempt, retry] = payloads.map(body => JSON.parse(body));
    assert.ok(firstAttempt.tools?.length);
    assert.equal(retry.tools, undefined);
    assert.equal(retry.model, firstAttempt.model);
    assert.match(retry.messages.at(-1).content, /虚构测试摘要/);
    assert.equal(await balance(), 9500);

    answerMode = 'invalid_twice';
    const failedId = crypto.randomUUID();
    const attemptsBeforeFailure = answering;
    const invalid = await request(users[0], failedId);
    assert.equal(invalid.status, 502);
    assert.doesNotMatch(await invalid.text(), /DSML|Unfinished response/);
    assert.equal(answering, attemptsBeforeFailure + 2);
    assert.equal(await balance(), 9500, 'the failed operation must refund its reservation');
    const failedOperation = await prisma.serviceOperation.findFirstOrThrow({ where: { userId: users[0], idempotencyKey: `followup:${audit.id}:${failedId}` } });
    assert.equal(failedOperation.status, 'FAILED');
    assert.equal(failedOperation.errorCode, 'invalid_tool_calls');
    assert.equal(failedOperation.resultJson, null);
    const invalidUsage = await prisma.modelUsageEvent.findFirstOrThrow({ where: { userId: users[0], operation: 'followup', status: 'failed', errorCode: 'invalid_tool_calls' } });
    assert.equal(invalidUsage.inputTokens, 80);
    assert.equal(invalidUsage.outputTokens, 20);
    answerMode = 'unavailable';
    const failed = await request(users[0]);assert.equal(failed.status, 502);assert.equal(await balance(), 9500);
    answerMode = 'unsupported';
    await prisma.audit.update({ where: { id: audit.id }, data: { isPublic: true } });
    payloads.length = 0;
    const publicReader = await request(users[1]);assert.equal(publicReader.status, 200);
    assert.ok(payloads.length >= 2);assert.ok(payloads.every(body => !body.includes(privateMarker)), 'public followups must not send hidden article text, quotes or owner-only supplements to planning or answer models');
    assert.equal(await prisma.serviceOperation.count({ where: { userId: users[0], status: 'COMPLETED', operation: 'followup' } }), 5);
    assert.equal(await prisma.reportFollowup.count({ where: { userId: users[0], reportId: audit.id } }), 5);
    assert.equal(await prisma.reportFollowup.count({ where: { userId: users[0], reportId: audit.id, answer: { contains: 'DSML' } } }), 0);
    assert.equal(await prisma.reportFollowup.count({ where: { userId: users[1], reportId: audit.id } }), 1);
    console.log('Event followup smoke passed: real HTTP model and search fixtures, platform prefetch, cached research, single charge, summed usage, offline policy, tool protocol fallback, failure refund, clean history, CSRF/auth and private report boundaries.');
  } finally {
    await prisma.modelUsageEvent.deleteMany({ where: { userId: { in: users } } });await prisma.user.deleteMany({ where: { id: { in: users } } });await prisma.platformModelConfig.delete({ where: { id: model.id } });
    for (const name of envNames) if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name];
    server.closeAllConnections();await new Promise<void>(resolve => server.close(() => resolve()));await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error);process.exitCode = 1; });

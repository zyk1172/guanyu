import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { ownerAuditDto, publicAuditDto } from '../lib/audit-dto';
import { encryptSecret } from '../lib/secret';
import { WebResearchSession } from '../lib/web-research';
import { createRelatedCoverage, runRelatedCoverage, getRelatedCoverage, coverageFingerprint, CoverageError } from '../lib/related-coverage-service';
import { GET, POST } from '../app/api/audits/[id]/related-coverage/route';

const original = '2026年5月1日，海城图书馆开始延长周末开放时间。问卷共回收75份，其中60份支持延长开放。问卷方法与额外人力费用尚未说明。'.repeat(3);
const alternative = '海城图书馆于2026年5月1日开始延长周末开放时间。馆方表示将记录每晚到访情况，试点两个月后公布评估。新增排班费用由年度预算承担，具体金额尚未公开。'.repeat(3);
const finding = () => ({ text: '原报道侧重问卷偏好，另一报道补充了评估安排，费用金额仍需核实。', citations: [{ article: 0, quote: '问卷共回收75份，其中60份支持延长开放。' }, { article: 1, quote: '馆方表示将记录每晚到访情况，试点两个月后公布评估。' }] });
const synthesis = () => ({ matches: [{ article: 1, reason: '同一图书馆同日开始的同一试点。', anchors: ['海城图书馆', '2026年5月1日'] }], summary: finding(), sharedClaims: [], differences: [finding()], missingEvidence: [] });
const reply = (value: string, status = 200, type = 'text/html; charset=utf-8') => ({ status, headers: new Headers({ 'content-type': type }), body: Buffer.from(value) });
function research(empty = false) {
  return new WebResearchSession({ searxngUrl: 'https://search.fixture', request: async url => {
    if (url.startsWith('https://search.fixture/')) return reply(JSON.stringify({ results: empty ? [] : [{ title: '虚构教学报道', url: 'https://news-a.example/library' }, { title: '转载', url: 'https://news-b.example/reprint' }, { title: '打不开', url: 'https://news-c.example/blocked' }, { title: '其他事件', url: 'https://news-d.example/background' }] }), 200, 'application/json');
    if (empty || url.includes('/blocked')) return reply('unavailable', 503);
    const text = url.includes('/background') ? '另一个城市的一家博物馆于2025年开展了展览活动，与图书馆无关。'.repeat(8) : alternative;
    return reply(`<html><head><title>虚构教学：延时开放的评估安排</title></head><body><article><h1>虚构教学：延时开放的评估安排</h1><p>${text}</p></article></body></html>`);
  } });
}
async function main() {
  let calls = 0; let output: 'valid' | 'invalid' | 'unrelated' = 'valid'; let duringModel: (() => Promise<unknown>) | undefined;
  const server = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    calls++;
    if (duringModel) await duringModel();
    const value = output === 'unrelated' ? { matches: [], summary: null, sharedClaims: [], differences: [], missingEvidence: [] } : synthesis();
    if (output === 'invalid' && value.summary) value.summary.citations[1].quote = '这是正文中不存在的虚构引用';
    await new Promise(resolve => setTimeout(resolve, 50));
    response.writeHead(200, { 'Content-Type': 'application/json' });response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 150 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const oldBase = process.env.OPENAI_BASE_URL; const oldAllow = process.env.ALLOW_PRIVATE_ADMIN_LLM;
  process.env.OPENAI_BASE_URL = baseUrl; process.env.ALLOW_PRIVATE_ADMIN_LLM = 'true';
  const suffix = crypto.randomUUID();
  const model = await prisma.platformModelConfig.create({ data: { configKey: `coverage-smoke-${suffix}`, displayName: 'Local coverage fixture', modelId: 'fixture', baseUrl, apiKeyEncrypted: encryptSecret('unused-local-key'), searchMode: 'none' } });
  const owner = await prisma.user.create({ data: { email: `coverage-owner-${suffix}@example.test`, password: 'unused-fixture', creditBalance: 10, creditBalanceCents: 1000, creditBalanceAmount: 10, settings: { create: { modelSource: 'platform', defaultPlatformModelConfigId: model.id } } } });
  const other = await prisma.user.create({ data: { email: `coverage-other-${suffix}@example.test`, password: 'unused-fixture' } });
  try {
    const audit = await prisma.audit.create({ data: { userId: owner.id, title: '海城图书馆延长开放试点', source: '虚构材料', publishedAt: '2026-05-01', originalContent: original, auditResultJson: '{}', newsSummary: '', analysisMode: 'deep', reasoningDepth: 'medium', modelName: 'fixture', isPublic: true } });
    const fingerprint = coverageFingerprint(audit);
    const input = (query: string) => ({ query, sourceFingerprint: fingerprint, expectedCostCents: 100 });
    const balance = async () => (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).creditBalanceCents;
    const ctx = { params: Promise.resolve({ id: audit.id }) };
    assert.equal((await GET(new NextRequest(`http://localhost/api/audits/${audit.id}/related-coverage`), ctx)).status, 401);
    assert.equal((await POST(new NextRequest(`http://localhost/api/audits/${audit.id}/related-coverage`, { method: 'POST', headers: { origin: 'https://foreign.example' } }), ctx)).status, 403);
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: other.id, sessionVersion: other.sessionVersion } });
    assert.equal((await GET(new NextRequest(`http://localhost/api/audits/${audit.id}/related-coverage`, { headers: { cookie: `next-auth.session-token=${token}` } }), ctx)).status, 404);
    await assert.rejects(createRelatedCoverage(other.id, audit.id, input('越权')), (e: unknown) => e instanceof CoverageError && e.status === 404);
    await assert.rejects(createRelatedCoverage(owner.id, audit.id, { ...input('费率'), expectedCostCents: 0 }), /coverage_price_changed/);
    assert.equal(await balance(), 1000);
    const parallel = await Promise.all([createRelatedCoverage(owner.id, audit.id, input('海城图书馆 同一事件')), createRelatedCoverage(owner.id, audit.id, input('海城图书馆 同一事件'))]);
    assert.equal(parallel.filter(task => task.state === 'claimed').length, 1);
    const task = parallel.find(task => task.state === 'claimed')!;
    assert.ok(task.model);
    await runRelatedCoverage(task.operation.id, task.operation.currentAttempt, task.model!, { research: research() });
    const saved = await getRelatedCoverage(owner.id, audit.id, task.operation.id);
    assert.equal(saved.status, 'completed', JSON.stringify(saved)); assert.equal(saved.result!.articles.length, 1); assert.equal(saved.result!.unreadableCount, 1); assert.equal(saved.result!.excludedCount, 1);
    assert.equal(await balance(), 900); assert.equal(calls, 1);
    const persisted = await prisma.audit.findUniqueOrThrow({ where: { id: audit.id } });
    assert.ok(JSON.parse(persisted.auditResultJson).relatedCoverage, 'successful supplement is appended to report JSON for backup durability');
    assert.equal(JSON.parse(publicAuditDto({ ...persisted, isSourcePublic: true }).auditResultJson).relatedCoverage, undefined);
    assert.ok(JSON.parse(ownerAuditDto(persisted).auditResultJson).relatedCoverage);
    await prisma.audit.update({ where: { id: audit.id }, data: { viewCount: { increment: 1 } } });
    const cached = await createRelatedCoverage(owner.id, audit.id, input('海城图书馆 同一事件'));
    assert.equal(cached.state, 'completed');assert.equal(await balance(), 900);assert.equal(calls, 1);
    const fail = async (query: string, mode: typeof output, errorCode: string, empty = false) => {
      output = mode;
      const next = await createRelatedCoverage(owner.id, audit.id, input(query));assert.ok(next.model);
      await runRelatedCoverage(next.operation.id, next.operation.currentAttempt, next.model!, { research: research(empty) });
      const state = await getRelatedCoverage(owner.id, audit.id, next.operation.id);
      assert.equal(state.status, 'failed');assert.equal(state.errorCode, errorCode);assert.equal(await balance(), 900);
      assert.ok(state.previous, 'failed new searches preserve the previous successful supplement');
    };
    await fail('无结果', 'valid', 'coverage_no_sources', true);
    await fail('无效引用', 'invalid', 'coverage_invalid_citations');
    await fail('其他事件', 'unrelated', 'coverage_no_match');
    output = 'valid';
    const changed = await createRelatedCoverage(owner.id, audit.id, input('原文改变'));assert.ok(changed.operation && changed.model);
    await prisma.audit.update({ where: { id: audit.id }, data: { originalContent: original + '已修订' } });
    await runRelatedCoverage(changed.operation.id, changed.operation.currentAttempt, changed.model!, { research: research() });
    assert.equal(await balance(), 900);
    assert.equal((await prisma.serviceOperation.findUniqueOrThrow({ where: { id: changed.operation.id } })).errorCode, 'coverage_source_changed');
    await prisma.audit.update({ where: { id: audit.id }, data: { originalContent: original } });
    duringModel = () => prisma.audit.update({ where: { id: audit.id }, data: { title: '已更正标题' } });
    const racing = await createRelatedCoverage(owner.id, audit.id, input('生成期间改变'));assert.ok(racing.operation && racing.model);
    await runRelatedCoverage(racing.operation.id, racing.operation.currentAttempt, racing.model!, { research: research() });
    assert.equal(await balance(), 900);
    await prisma.audit.update({ where: { id: audit.id }, data: { title: audit.title } });duringModel = undefined;
    const expired = await createRelatedCoverage(owner.id, audit.id, input('任务超时'));assert.ok(expired.operation && expired.model);
    await prisma.serviceOperation.update({ where: { id: expired.operation.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await getRelatedCoverage(owner.id, audit.id, expired.operation.id)).errorCode, 'coverage_expired');assert.equal(await balance(), 900);
    const before = calls;await runRelatedCoverage(expired.operation.id, expired.operation.currentAttempt, expired.model!, { research: research() });assert.equal(calls, before);
    await prisma.user.update({ where: { id: owner.id }, data: { creditBalance: 0, creditBalanceCents: 0, creditBalanceAmount: 0 } });
    await assert.rejects(createRelatedCoverage(owner.id, audit.id, input('余额不足')), /coverage_insufficient_credits/);
    await prisma.serviceOperation.deleteMany({ where: { userId: owner.id } });
    assert.equal((await getRelatedCoverage(owner.id, audit.id)).status, 'completed', 'report supplement survives task cache cleanup / backup restore');
    assert.equal((await createRelatedCoverage(owner.id, audit.id, input('海城图书馆 同一事件'))).state, 'completed');
    const usage = await prisma.modelUsageEvent.aggregate({ where: { userId: owner.id, status: 'success' }, _sum: { creditCostCents: true } });assert.equal(usage._sum.creditCostCents, 100);
    console.log('Related coverage smoke passed: real HTTP model, safe reader fixtures, event matching, source excerpts, independent duplicate removal, owner-only access/CSRF, server price confirmation, single concurrent charge, cache persistence, no-source/no-match/invalid-citation refunds, source-change fencing, expiration refund, balance protection and usage accounting.');
  } finally {
    await prisma.modelUsageEvent.deleteMany({ where: { userId: { in: [owner.id, other.id] } } });await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });await prisma.platformModelConfig.delete({ where: { id: model.id } });
    if (oldBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = oldBase;
    if (oldAllow === undefined) delete process.env.ALLOW_PRIVATE_ADMIN_LLM; else process.env.ALLOW_PRIVATE_ADMIN_LLM = oldAllow;
    await prisma.$disconnect();server.closeAllConnections();await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
main().catch(error => { console.error(error);process.exitCode = 1; });

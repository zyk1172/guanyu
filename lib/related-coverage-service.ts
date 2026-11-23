import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { resolveOperationModel } from './operation-model';
import { beginServiceOperation, completeServiceOperation, failServiceOperation } from './service-operation';
import { recordModelUsage } from './model-usage';
import { invokeModel } from './model-runtime';
import { reserveQaAttempt } from './rate-limit';
import { cacheDel, CACHE_KEYS } from './cache';
import { formatCredits } from './billing';
import { normalizeReportLanguage } from './types';
import { getReportLanguageRule } from './report-language-core.mjs';
import { WebResearchSession } from './web-research';
import { addResearchUsage, planEventSearch } from './event-search';
import { collectRelatedCoverage, type CoverageResearch } from './related-coverage-research';
import { coverageQuerySchema, coverageResultSchema, coveragePrompt, defaultCoverageQuery, validateCoverageSynthesis, type CoverageOriginal, type CoverageResult } from './related-coverage';

export class CoverageError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
const prefix = (id: string) => `related-coverage:v1:${id}:`;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const coverageFingerprint = (audit: CoverageOriginal & { reportLanguage: string }) => hash(JSON.stringify([audit.title, audit.source, audit.publishedAt, audit.originalContent, audit.reportVersion, audit.reportLanguage]));

async function ownedAudit(userId: string, auditId: string) {
  const audit = await prisma.audit.findFirst({ where: { id: auditId, userId, user: { isBanned: false } } });
  if (!audit) throw new CoverageError('coverage_not_found', 404);
  if (audit.originalContent.trim().length < 50) throw new CoverageError('coverage_no_original');
  return audit;
}
function parseStored(json: string | null): Record<string, any> {
  try { const value = JSON.parse(json || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function savedSupplement(audit: CoverageOriginal & { auditResultJson: string; reportLanguage: string }) {
  const parsed = coverageResultSchema.safeParse(parseStored(audit.auditResultJson).relatedCoverage);
  return parsed.success && parsed.data.sourceFingerprint === coverageFingerprint(audit) ? parsed.data : undefined;
}
function state(operation: { id: string; status: string; resultJson: string | null; errorCode: string | null }) {
  const stored = parseStored(operation.resultJson);
  return { jobId: operation.id, status: operation.status.toLowerCase(), query: stored.query || '', stage: stored.stage || 'search', ...(operation.status === 'COMPLETED' ? { result: stored as CoverageResult } : {}), ...(operation.status === 'FAILED' ? { errorCode: operation.errorCode || 'coverage_failed' } : {}) };
}

export type CoverageJobState = { status: string; jobId?: string; query?: string; stage?: string; sourceFingerprint?: string; defaultQuery?: string; errorCode?: string; result?: CoverageResult; previous?: CoverageResult };

export async function getRelatedCoverage(userId: string, auditId: string, jobId?: string): Promise<CoverageJobState> {
  const audit = await ownedAudit(userId, auditId);
  const sourceFingerprint = coverageFingerprint(audit);
  const operation = await prisma.serviceOperation.findFirst({ where: { userId, idempotencyKey: { startsWith: `${prefix(auditId)}${sourceFingerprint}:` }, ...(jobId ? { id: jobId } : {}) }, orderBy: { updatedAt: 'desc' } });
  const base = { sourceFingerprint, defaultQuery: defaultCoverageQuery(audit.title, audit.originalContent) };
  if (!operation) { const result = savedSupplement(audit); return result ? { ...base, status: 'completed', result, query: result.query } : { ...base, status: 'idle' }; }
  const saved = operation.status === 'COMPLETED' ? null : await prisma.serviceOperation.findFirst({ where: { userId, idempotencyKey: { startsWith: `${prefix(auditId)}${sourceFingerprint}:` }, status: 'COMPLETED' }, orderBy: { updatedAt: 'desc' } });
  const previousResult = saved ? parseStored(saved.resultJson) as CoverageResult : savedSupplement(audit);
  const previous = previousResult ? { previous: previousResult } : {};
  if (operation.status !== 'RUNNING' && parseStored(operation.resultJson).sourceFingerprint !== sourceFingerprint) return { ...base, status: 'idle' };
  if (operation.status === 'RUNNING' && (!operation.expiresAt || operation.expiresAt <= new Date())) {
    await failServiceOperation(operation.id, operation.currentAttempt, 'coverage_expired');
    return { ...base, ...previous, ...state({ ...operation, status: 'FAILED', errorCode: 'coverage_expired' }) };
  }
  return { ...base, ...previous, ...state(operation) };
}

export async function createRelatedCoverage(userId: string, auditId: string, input: { query?: unknown; sourceFingerprint?: unknown; expectedCostCents?: unknown }) {
  const audit = await ownedAudit(userId, auditId);
  const sourceFingerprint = coverageFingerprint(audit);
  if (input.sourceFingerprint !== sourceFingerprint) throw new CoverageError('coverage_source_changed', 409);
  const parsed = coverageQuerySchema.safeParse(input.query ?? defaultCoverageQuery(audit.title, audit.originalContent));
  if (!parsed.success) throw new CoverageError('coverage_invalid_query');
  const query = parsed.data.replace(/\s+/g, ' ');
  const idempotencyKey = `${prefix(auditId)}${sourceFingerprint}:${hash(query)}`;
  const restored = savedSupplement(audit);
  if (restored?.query === query) return { state: 'completed' as const, job: { status: 'completed', result: restored, query }, operation: undefined };
  const prior = await prisma.serviceOperation.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (prior?.status === 'COMPLETED') return { state: 'completed' as const, job: state(prior), operation: prior };
  if (prior?.status === 'RUNNING' && prior.expiresAt && prior.expiresAt > new Date()) return { state: 'running' as const, job: state(prior), operation: prior };
  let model;
  try { model = await resolveOperationModel({ userId, operation: 'followup' }); } catch { throw new CoverageError('coverage_model_unavailable'); }
  if (input.expectedCostCents !== model.costCents) throw new CoverageError('coverage_price_changed', 409);
  try { await reserveQaAttempt(userId); } catch { throw new CoverageError('coverage_rate_limit', 429); }
  let claimed;
  try {
    claimed = await beginServiceOperation({ userId, idempotencyKey, operation: 'followup', reservedCredits: model.costCents, transactionType: 'AI_RELATED_COVERAGE', description: `查找其他报道并追加对比分析，消耗 ${formatCredits(model.costCents)} 点`, auditId,
      modelSnapshot: model.snapshot ? { configId: model.snapshot.configId, displayName: model.snapshot.displayName, modelName: model.snapshot.modelId, multiplierBps: model.snapshot.multiplierBps, configVersion: model.snapshot.configVersion } : undefined });
  } catch { throw new CoverageError('coverage_insufficient_credits', 402); }
  if (claimed.state !== 'claimed') return { state: claimed.state, job: state(claimed.operation), operation: claimed.operation };
  try {
    const operation = await prisma.serviceOperation.update({ where: { id: claimed.operation.id }, data: { resultId: auditId, resultJson: JSON.stringify({ query, sourceFingerprint, stage: 'search' }), expiresAt: new Date(Date.now() + 210000) } });
    return { state: 'claimed' as const, job: state(operation), operation, model };
  } catch {
    await failServiceOperation(claimed.operation.id, claimed.operation.currentAttempt, 'coverage_failed');
    throw new CoverageError('coverage_failed', 503);
  }
}

type CoverageModel = Awaited<ReturnType<typeof resolveOperationModel>>;
export async function runRelatedCoverage(operationId: string, expectedAttempt: number, model: CoverageModel, dependencies: { research?: CoverageResearch } = {}) {
  const operation = await prisma.serviceOperation.findUnique({ where: { id: operationId } });
  if (!operation || operation.status !== 'RUNNING' || operation.currentAttempt !== expectedAttempt) return;
  if (!operation.expiresAt || operation.expiresAt <= new Date()) { await failServiceOperation(operation.id, expectedAttempt, 'coverage_expired'); return; }
  const pending = parseStored(operation.resultJson);
  const startedAt = Date.now();
  const searchCounts: Record<string, number> = {};
  let usage: Awaited<ReturnType<typeof invokeModel>>['usage'];
  let failureCode = 'coverage_failed';
  let settled = false;
  const track = (status: 'success' | 'failed') => recordModelUsage({ userId: operation.userId, auditId: operation.resultId, operation: 'comparison', status, source: model.source, snapshot: model.snapshot, creditCostCents: status === 'success' ? operation.reservedCredits : 0, usage, externalSearchCounts: searchCounts, durationMs: Date.now() - startedAt, errorCode: status === 'failed' ? failureCode : null }).catch(() => {});
  try {
    if (!operation.idempotencyKey.startsWith('related-coverage:v1:') || !operation.resultId || !coverageQuerySchema.safeParse(pending.query).success) throw new CoverageError('coverage_failed');
    const audit = await ownedAudit(operation.userId, operation.resultId);
    if (coverageFingerprint(audit) !== pending.sourceFingerprint) throw new CoverageError('coverage_source_changed');
    const original = { ...audit, originalContent: audit.originalContent.slice(0, 6000) };
    const plan = await planEventSearch({ ...original, question: `Find other reporting of this specific event. User search terms: ${pending.query}` }, model, { forceSearch: true });
    usage = addResearchUsage(plan.usage);
    // This feature always uses the existing free engine chain. No paid search fallback.
    const research = dependencies.research || new WebResearchSession({ timeoutMs: 55000, searchOptions: { provider: 'free', locale: normalizeReportLanguage(audit.reportLanguage), onRequest: (provider) => { searchCounts[provider] = (searchCounts[provider] || 0) + 1; } } });
    const collected = await collectRelatedCoverage(original, pending.query, research, plan.queries);
    if (!collected.articles.length) throw new CoverageError('coverage_no_sources');
    await prisma.serviceOperation.updateMany({ where: { id: operation.id, status: 'RUNNING', currentAttempt: expectedAttempt }, data: { resultJson: JSON.stringify({ ...pending, stage: 'compare' }) } });
    const prompt = coveragePrompt(original, collected.articles, pending.query, getReportLanguageRule(normalizeReportLanguage(audit.reportLanguage)).name);
    const response = await invokeModel({ provider: model.provider, baseUrl: model.baseUrl, apiKey: model.apiKey, modelId: model.modelId, reasoningDepth: model.reasoningDepth, allowPrivateAddress: model.allowPrivateAddress, timeoutMs: 100000, maxTokens: 4500, jsonMode: true, nativeSearch: false, ...prompt });
    usage = addResearchUsage(usage, response.usage);
    if (!response.ok) throw new CoverageError('coverage_model_failed');
    let synthesis;
    try { synthesis = validateCoverageSynthesis(JSON.parse(response.message.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), original.originalContent, collected.articles); }
    catch { throw new CoverageError('coverage_invalid_citations'); }
    if (!synthesis.matches.length) throw new CoverageError('coverage_no_match');
    const result: CoverageResult = { query: pending.query, searchQueries: collected.searchQueries, sourceFingerprint: pending.sourceFingerprint, generatedAt: new Date().toISOString(), articles: collected.articles.filter(item => synthesis.matches.some(match => match.article === item.number)).map(({ number, title, url }) => ({ number, title, url })), synthesis, unreadableCount: collected.unreadableCount, excludedCount: collected.excludedCount,
      usage: { model: model.snapshot?.displayName || model.modelId, source: model.source, cost: formatCredits(operation.reservedCredits) } };
    await completeServiceOperation(operation.id, expectedAttempt, { resultId: audit.id, resultJson: JSON.stringify(result) }, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-audit-verification:${audit.id}`}))`;
      const current = await tx.audit.findFirst({ where: { id: audit.id, userId: operation.userId, user: { isBanned: false } } });
      if (!current || coverageFingerprint(current) !== pending.sourceFingerprint) throw new CoverageError('coverage_source_changed');
      await tx.audit.update({ where: { id: audit.id }, data: { auditResultJson: JSON.stringify({ ...parseStored(current.auditResultJson), relatedCoverage: result }) } });
    });
    settled = true;
    await cacheDel(CACHE_KEYS.audit(audit.id)).catch(() => {});
    await track('success');
  } catch (error) {
    if (settled) return;
    failureCode = error instanceof CoverageError ? error.code : 'coverage_failed';
    await failServiceOperation(operation.id, expectedAttempt, failureCode).catch(() => {});
    await track('failed');
  }
}

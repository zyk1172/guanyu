import { platformAnalysisVersion, type AnalysisQuote } from '@/lib/analysis-quote';
import { AppError } from '@/lib/app-error';
import { personalModelFingerprint } from '@/lib/model-config';
import { randomUUID } from 'crypto';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { releaseAnalyzeJobAdmission, reserveAnalyzeJobAdmission } from '@/lib/rate-limit';
import { analyzeForUser } from '@/lib/analyze-service';
import { dispatchQueuedEmails, queueReportCompleted } from '@/lib/email';
import { Prisma } from '@/lib/generated/prisma/client';
import { normalizeReportLanguage, type ReportLanguage } from '@/lib/types';
import { buildUsagePlan, getUsageSource } from '@/lib/billing';
import { operationCostCents } from '@/lib/platform-model-core.mjs';
import { encodePlatformModelSnapshot, platformModelSnapshot, resolvePlatformModel } from '@/lib/platform-models';
import { assertArticleText } from '@/lib/article-input';

const MAX_NEWS_CONTENT_LENGTH = 30_000;
const JOB_LEASE_MS = 6 * 60 * 1000;
const JOB_RETRY_DELAY_MS = 30 * 1000;
const JOB_MAX_ATTEMPTS = Math.max(1, Number(process.env.PLATFORM_ANALYSIS_MAX_RETRIES || 1) + 1);

export type AnalyzeJobInput = {
  title: string;
  source: string;
  content: string;
  focus?: string;
  reportLanguage?: ReportLanguage;
  sourceUrl?: string;
};

function normalizeSourceUrl(value: unknown) {
  const raw = String(value || '').trim().slice(0, 2048);
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function normalizeAnalyzeJobInput(input: Partial<AnalyzeJobInput>) {
  return {
    title: String(input.title || '').trim().slice(0, 180),
    source: String(input.source || '').trim().slice(0, 180),
    content: String(input.content || '').trim().slice(0, MAX_NEWS_CONTENT_LENGTH),
    focus: String(input.focus || '').trim().slice(0, 1000),
    sourceUrl: normalizeSourceUrl(input.sourceUrl),
    ...(typeof input.reportLanguage === 'string'
      ? { reportLanguage: normalizeReportLanguage(input.reportLanguage) }
      : {}),
    mode: 'deep',
  };
}

export async function createAnalyzeJob(userId: string, input: Partial<AnalyzeJobInput>, requestId?: unknown, confirmedQuote?: AnalysisQuote | null) {
  await ensureRuntimeSchema();
  const normalizedInput = normalizeAnalyzeJobInput(input);
  assertArticleText(normalizedInput.content, normalizedInput.title);

  const clientRequestId = typeof requestId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId) ? requestId : null;
  const requestKey = clientRequestId ? { userId_clientRequestId: { userId, clientRequestId } } : null;
  if (requestKey) {
    const existing = await prisma.auditJob.findUnique({ where: requestKey });
    if (existing) return existing;
  }
  if (confirmedQuote === null) {
    throw new AppError('ANALYSIS_QUOTE_CHANGED', '请先确认当前分析费用，再提交审视任务。', 409);
  }
  const admission = await reserveAnalyzeJobAdmission(userId);
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { modelSource: true, defaultPlatformModelConfigId: true, llmProvider: true, llmBaseUrl: true, llmApiKeyEncrypted: true, defaultModelName: true, defaultReasoningDepth: true },
    });
    const usageSource = await getUsageSource(userId, settings?.modelSource || 'platform');
    let snapshotJson: string | null = null;
    let creditCostCents = 0;
    let modelVersion: string | undefined;
    let platformSnapshot: ReturnType<typeof platformModelSnapshot> | undefined;
    if (usageSource === 'platform') {
      const selectedModel = await resolvePlatformModel({
        userDefaultId: settings?.defaultPlatformModelConfigId,
        operation: 'analysis',
      });
      platformSnapshot = platformModelSnapshot(selectedModel);
      creditCostCents = operationCostCents('analysis', platformSnapshot.multiplierBps);
      snapshotJson = encodePlatformModelSnapshot(platformSnapshot);
      modelVersion = platformAnalysisVersion(platformSnapshot);
    } else if (settings) {
      modelVersion = personalModelFingerprint(settings);
      snapshotJson = JSON.stringify({ personalFingerprint: modelVersion });
    }
    if (confirmedQuote && (
      confirmedQuote.source !== usageSource || confirmedQuote.costCents !== creditCostCents || confirmedQuote.modelVersion !== modelVersion
    )) {
      throw new AppError('ANALYSIS_QUOTE_CHANGED', '分析费用或模型已变更，请确认更新后的报价。', 409);
    }
    if (platformSnapshot) {
      await buildUsagePlan(userId, 'deep', 'platform', {
        platformCostCents: creditCostCents,
        modelSnapshot: {
          configId: platformSnapshot.configId,
          displayName: platformSnapshot.displayName,
          modelName: platformSnapshot.modelId,
          multiplierBps: platformSnapshot.multiplierBps,
          configVersion: platformSnapshot.configVersion,
        },
      });
    } else {
      await buildUsagePlan(userId, 'deep', 'custom');
    }
    return await prisma.auditJob.create({
      data: {
        userId,
        status: 'pending',
        clientRequestId,
        attemptCount: 0,
        nextAttemptAt: new Date(),
        inputJson: JSON.stringify({ ...normalizedInput, modelSource: usageSource, admissionEventId: admission.id }),
        modelSnapshotJson: snapshotJson,
        creditCostCents,
      },
    });
  } catch (error) {
    await releaseAnalyzeJobAdmission(userId, admission.id);
    if (requestKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.auditJob.findUnique({ where: requestKey });
      if (existing) return existing;
    }
    throw error;
  }
}

async function completeJobWithAudit(tx: Prisma.TransactionClient, jobId: string, workerId: string, auditId: string) {
  const completed = await tx.auditJob.updateMany({
    where: { id: jobId, workerId, status: 'running', leaseExpiresAt: { gt: new Date() } },
    data: {
      status: 'completed',
      auditId,
      error: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      nextAttemptAt: null,
      workerId: null,
      inputJson: JSON.stringify({ auditId, completedAt: new Date().toISOString() }),
    },
  });
  if (!completed.count) throw new Error('审视任务领取状态已变更。');
  await queueReportCompleted(tx, auditId);
}

export async function runAnalyzeJob(jobId: string) {
  const now = new Date();
  const workerId = `run-${randomUUID()}`;
  const claim = await prisma.auditJob.updateMany({
    where: {
      id: jobId,
      OR: [
        {
          status: 'pending',
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: now } },
          ],
        },
        { status: 'running', leaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      status: 'running',
      error: null,
      attemptCount: { increment: 1 },
      leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
      lastHeartbeatAt: now,
      workerId,
    },
  });
  if (claim.count !== 1) return;

  const ownership = { id: jobId, workerId, status: 'running' } as const;
  const job = await prisma.auditJob.findFirst({ where: ownership });
  if (!job) return;
  const heartbeat = setInterval(() => {
    const currentTime = new Date();
    void prisma.auditJob.updateMany({
      where: { ...ownership, leaseExpiresAt: { gt: currentTime } },
      data: { leaseExpiresAt: new Date(currentTime.getTime() + JOB_LEASE_MS), lastHeartbeatAt: currentTime },
    }).catch(() => console.error('[analyze-job] heartbeat failed', jobId));
  }, 30_000);
  heartbeat.unref();

  try {
    const existingAudit = await prisma.audit.findUnique({ where: { sourceJobId: job.id }, select: { id: true } });
    if (existingAudit) {
      await prisma.$transaction(tx => completeJobWithAudit(tx, jobId, workerId, existingAudit.id));
    } else {
      if (job.attemptCount > JOB_MAX_ATTEMPTS) throw new Error('审视任务重试次数已用完。');
      const { modelSource, ...input } = JSON.parse(job.inputJson);
      const data = await analyzeForUser({
        userId: job.userId,
        input,
        executionContext: {
          jobId: job.id,
          platformModelSnapshotJson: job.modelSnapshotJson,
          creditCostCents: job.creditCostCents ?? undefined,
          requestedSource: modelSource === 'custom' ? 'custom' : 'platform',
          personalFingerprint: modelSource === 'custom' && job.modelSnapshotJson
            ? JSON.parse(job.modelSnapshotJson).personalFingerprint : undefined,
          completeAudit: (tx, auditId) => completeJobWithAudit(tx, jobId, workerId, auditId),
        },
      });
      if (!data.auditId) throw new Error('审视任务没有生成报告。');
    }
    await dispatchQueuedEmails().catch(() => console.error('[analyze-job] mail dispatch failed', jobId));
  } catch (error: any) {
    const retryable = error?.status !== 422 && job.attemptCount < JOB_MAX_ATTEMPTS;
    const failed = await prisma.auditJob.updateMany({
      where: { ...ownership, leaseExpiresAt: { gt: new Date() } },
      data: {
        status: retryable ? 'pending' : 'failed',
        error: error?.message || '审视任务执行失败。',
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        workerId: null,
        nextAttemptAt: retryable ? new Date(Date.now() + JOB_RETRY_DELAY_MS) : null,
        inputRetentionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    if (failed.count && !retryable) {
      try {
        const { admissionEventId } = JSON.parse(job.inputJson);
        await releaseAnalyzeJobAdmission(job.userId, admissionEventId);
      } catch {}
    }
  } finally {
    clearInterval(heartbeat);
  }
}

export async function dispatchAnalyzeJobs(limit = 5) {
  const now = new Date();
  const jobs = await prisma.auditJob.findMany({
    where: {
      OR: [
        { status: 'pending', OR: [{ nextAttemptAt: { lte: now } }, { nextAttemptAt: null }] },
        { status: 'running', leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const job of jobs) {
    await runAnalyzeJob(job.id);
  }
  return { dispatched: jobs.length, ids: jobs.map((job) => job.id) };
}

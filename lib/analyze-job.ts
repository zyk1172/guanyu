import { randomUUID } from 'crypto';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { releaseAnalyzeJobAdmission, reserveAnalyzeJobAdmission } from '@/lib/rate-limit';
import { analyzeForUser } from '@/app/api/analyze/route';
import { notifyReportCompleted } from '@/lib/email';
import { normalizeReportLanguage, type ReportLanguage } from '@/lib/types';
import { buildUsagePlan, getUsageSource } from '@/lib/billing';
import { operationCostCents } from '@/lib/platform-model-core.mjs';
import { encodePlatformModelSnapshot, platformModelSnapshot, resolvePlatformModel } from '@/lib/platform-models';
import { withHistoricalAuditModelName } from '@/lib/audit-model-display';

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

export async function createAnalyzeJob(userId: string, input: Partial<AnalyzeJobInput>) {
  await ensureRuntimeSchema();
  const normalizedInput = normalizeAnalyzeJobInput(input);
  if (normalizedInput.content.length < 50) {
    throw new Error('新闻正文太短，最少需要 50 个字符。');
  }

  const admission = await reserveAnalyzeJobAdmission(userId);
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { modelSource: true, defaultPlatformModelConfigId: true },
    });
    const usageSource = await getUsageSource(userId, settings?.modelSource || 'platform');
    let snapshotJson: string | null = null;
    let creditCostCents = 0;
    if (usageSource === 'platform') {
      const selectedModel = await resolvePlatformModel({
        selectedId: settings?.defaultPlatformModelConfigId,
        userDefaultId: settings?.defaultPlatformModelConfigId,
        operation: 'analysis',
      });
      const snapshot = platformModelSnapshot(selectedModel);
      creditCostCents = operationCostCents('analysis', snapshot.multiplierBps);
      snapshotJson = encodePlatformModelSnapshot(snapshot);
      await buildUsagePlan(userId, 'deep', 'platform', {
        platformCostCents: creditCostCents,
        modelSnapshot: {
          configId: snapshot.configId,
          displayName: snapshot.displayName,
          modelName: snapshot.modelId,
          multiplierBps: snapshot.multiplierBps,
          configVersion: snapshot.configVersion,
        },
      });
    } else {
      await buildUsagePlan(userId, 'deep', 'custom');
    }
    return await prisma.auditJob.create({
      data: {
        userId,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        inputJson: JSON.stringify({ ...normalizedInput, modelSource: usageSource, admissionEventId: admission.id }),
        modelSnapshotJson: snapshotJson,
        creditCostCents,
      },
    });
  } catch (error) {
    await releaseAnalyzeJobAdmission(userId, admission.id);
    throw error;
  }
}

async function completeJobWithAudit(jobId: string, auditId: string) {
  await prisma.auditJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      auditId,
      error: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      nextAttemptAt: null,
      workerId: null,
      inputJson: JSON.stringify({
        auditId,
        completedAt: new Date().toISOString(),
      }),
    },
  });

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      userId: true,
      title: true,
      source: true,
      reportLanguage: true,
      modelName: true,
      modelDisplayNameSnapshot: true,
      reasoningDepth: true,
      createdAt: true,
      auditResultJson: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!audit) return;
  let report: unknown = {};
  try {
    report = JSON.parse(audit.auditResultJson);
  } catch {
    report = {};
  }
  await notifyReportCompleted({
    userEmail: audit.user.email,
    audit: withHistoricalAuditModelName(audit),
    report,
  });
}

export async function runAnalyzeJob(jobId: string) {
  const now = new Date();
  const claim = await prisma.auditJob.updateMany({
    where: {
      id: jobId,
      OR: [
        { status: 'pending' },
        { status: 'running', leaseExpiresAt: { lte: now } },
      ],
    },
    data: {
      status: 'running',
      error: null,
      attemptCount: { increment: 1 },
      leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
      lastHeartbeatAt: now,
      workerId: `run-${randomUUID()}`,
    },
  });
  if (claim.count !== 1) return;

  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const existingAudit = await prisma.audit.findUnique({
    where: { sourceJobId: job.id },
    select: { id: true },
  });
  if (existingAudit) {
    await completeJobWithAudit(jobId, existingAudit.id);
    return;
  }

  if (job.attemptCount > JOB_MAX_ATTEMPTS) {
    await prisma.auditJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: '审视任务重试次数已用完。',
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        workerId: null,
        inputRetentionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return;
  }

  try {
    const storedInput = JSON.parse(job.inputJson);
    const { modelSource, ...input } = storedInput;
    const data = await analyzeForUser({
      userId: job.userId,
      input,
      executionContext: {
        jobId: job.id,
        platformModelSnapshotJson: job.modelSnapshotJson,
        creditCostCents: job.creditCostCents || undefined,
        requestedSource: modelSource === 'custom' ? 'custom' : 'platform',
      },
    });

    if (data.auditId) await completeJobWithAudit(jobId, data.auditId);
  } catch (error: any) {
    const retryable = job.attemptCount < JOB_MAX_ATTEMPTS;
    if (!retryable) {
      try {
        const storedInput = JSON.parse(job.inputJson);
        await releaseAnalyzeJobAdmission(job.userId, storedInput.admissionEventId);
      } catch {}
    }
    await prisma.auditJob.update({
      where: { id: jobId },
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
  }
}

export async function dispatchAnalyzeJobs(limit = 5) {
  const now = new Date();
  const jobs = await prisma.auditJob.findMany({
    where: {
      status: 'pending',
      OR: [
        { nextAttemptAt: { lte: now } },
        { nextAttemptAt: null },
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

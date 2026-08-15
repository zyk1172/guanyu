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

export async function runAnalyzeJob(jobId: string) {
  const claim = await prisma.auditJob.updateMany({
    where: { id: jobId, status: 'pending' },
    data: { status: 'running', error: null },
  });
  if (claim.count !== 1) return;

  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const storedInput = JSON.parse(job.inputJson);
    const { admissionEventId, modelSource, ...input } = storedInput;
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

    await prisma.auditJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        auditId: data.auditId || '',
        error: null,
      },
    });

    if (data.auditId) {
      const audit = await prisma.audit.findUnique({
        where: { id: data.auditId },
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
      if (audit) {
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
    }
  } catch (error: any) {
    try {
      const storedInput = JSON.parse(job.inputJson);
      await releaseAnalyzeJobAdmission(job.userId, storedInput.admissionEventId);
    } catch {}
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: error?.message || '审视任务执行失败。' },
    });
  }
}

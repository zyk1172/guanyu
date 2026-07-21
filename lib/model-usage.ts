import { prisma } from '@/lib/prisma';
import { estimateExternalCostMicros, type PlatformModelOperation } from '@/lib/platform-model-core.mjs';
import type { PlatformModelSnapshot } from '@/lib/platform-models';
import type { RuntimeUsage } from '@/lib/model-runtime';

export async function recordModelUsage(params: {
  userId?: string | null;
  auditId?: string | null;
  jobId?: string | null;
  operation: PlatformModelOperation;
  status: 'success' | 'failed';
  source: 'platform' | 'custom';
  snapshot?: PlatformModelSnapshot | null;
  creditCostCents?: number;
  usage?: RuntimeUsage;
  platformSearchRequests?: number;
  durationMs?: number;
  errorCode?: string | null;
}) {
  const snapshot = params.snapshot || null;
  const usage = params.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, nativeSearchRequests: 0 };
  return prisma.modelUsageEvent.create({
    data: {
      userId: params.userId || null,
      auditId: params.auditId || null,
      jobId: params.jobId || null,
      operation: params.operation,
      status: params.status,
      usageSource: params.source,
      platformModelConfigIdSnapshot: snapshot?.configId,
      modelDisplayNameSnapshot: snapshot?.displayName,
      modelNameSnapshot: snapshot?.modelId,
      modelProviderSnapshot: snapshot?.provider,
      modelConfigVersionSnapshot: snapshot?.configVersion,
      modelMultiplierBpsSnapshot: snapshot?.multiplierBps,
      creditCostCents: params.creditCostCents || 0,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      searchRequestCount: params.platformSearchRequests || 0,
      nativeSearchRequestCount: usage.nativeSearchRequests,
      estimatedExternalCostMicros: snapshot ? estimateExternalCostMicros(snapshot, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        nativeSearchRequests: usage.nativeSearchRequests,
      }) : 0,
      durationMs: Math.max(0, Math.trunc(params.durationMs || 0)),
      errorCode: params.errorCode ? String(params.errorCode).slice(0, 120) : null,
    },
  });
}

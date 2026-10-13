import { prisma } from '@/lib/prisma';
import { estimateExternalCostMicros, type PlatformModelOperation } from '@/lib/platform-model-core.mjs';
import type { PlatformModelSnapshot } from '@/lib/platform-models';
import type { RuntimeUsage } from '@/lib/model-runtime';
import { searchUnitRates, usageCostBreakdown } from '@/lib/usage-cost';

export async function recordModelUsage(params: {
  userId?: string | null;
  auditId?: string | null;
  jobId?: string | null;
  operation: PlatformModelOperation | 'comparison';
  status: 'success' | 'failed';
  source: 'platform' | 'custom';
  snapshot?: PlatformModelSnapshot | null;
  creditCostCents?: number;
  usage?: RuntimeUsage;
  platformSearchRequests?: number;
  externalSearchCounts?: Record<string, number>;
  durationMs?: number;
  errorCode?: string | null;
}) {
  const snapshot = params.snapshot || null;
  const usage = params.usage || { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, nativeSearchRequests: 0 };
  const cost = usageCostBreakdown({ snapshot, usage, searchCounts: params.externalSearchCounts, fallbackSearchCount: (params.platformSearchRequests || 0) + (usage.webSearchRequests || 0), rates: params.source === 'platform' ? searchUnitRates(process.env.SEARCH_UNIT_COST_MICROS_JSON) : {} });
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
      searchRequestCount: cost.searchRequestCount,
      estimatedSearchCostMicros: cost.estimatedSearchCostMicros,
      costCoverage: cost.costCoverage,
      costBreakdownJson: JSON.stringify(cost.details),
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

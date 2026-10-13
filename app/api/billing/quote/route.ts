import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { CREDIT_COSTS, effectiveCreditCents, getUsageSource } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { resolvePlatformModel, resolvePlatformModelApiKey, platformModelSnapshot } from '@/lib/platform-models';
import { operationCostCents, type PlatformModelOperation } from '@/lib/platform-model-core.mjs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const [settings, account] = user ? await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: user.id }, select: { modelSource: true, defaultPlatformModelConfigId: true, llmApiKeyEncrypted: true, defaultModelName: true } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true } }),
    ]) : [null, null];
    const source = user ? await getUsageSource(user.id, settings?.modelSource || 'platform') : 'platform';
    const operations = ['analysis', 'completion', 'followup'] as const;
    const prices = await Promise.all(operations.map(async (operation: PlatformModelOperation) => {
      if (source === 'custom') return { operation, costCents: 0, modelName: settings?.defaultModelName || '', available: Boolean(settings?.llmApiKeyEncrypted) };
      try {
        const model = await resolvePlatformModel({ operation, userDefaultId: settings?.defaultPlatformModelConfigId });
        return { operation, costCents: operationCostCents(operation, model.creditMultiplierBps), modelName: model.displayName, available: Boolean(await resolvePlatformModelApiKey(platformModelSnapshot(model))) };
      } catch { return { operation, costCents: null, modelName: '', available: false }; }
    }));
    return NextResponse.json({ source, prices, exportCostCents: CREDIT_COSTS.MARKDOWN_EXPORT, balanceCents: account ? effectiveCreditCents(account) : null, quotedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: '无法确认当前模型费用，请检查账号模型设置后重试。' }, { status: 503 });
  }
}

import { prisma } from '@/lib/prisma';
import { getOrCreateAppSetting, getUsageSource } from '@/lib/billing';
import { chooseModelConfig } from '@/lib/model-config';
import { decryptSecret } from '@/lib/secret';
import { operationCostCents, type PlatformModelOperation } from '@/lib/platform-model-core.mjs';
import { platformModelSnapshot, resolvePlatformModel, type PlatformModelSnapshot } from '@/lib/platform-models';

export async function resolveOperationModel(params: {
  userId: string;
  operation: PlatformModelOperation;
}) {
  const [settings, appSetting] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: params.userId } }),
    getOrCreateAppSetting(),
  ]);
  const source = await getUsageSource(params.userId, settings?.modelSource || 'platform');
  if (source === 'custom') {
    const custom = chooseModelConfig({ usageSource: 'custom', userSettings: settings, appSetting });
    if (!custom.apiKey || !custom.baseURL || !custom.modelName) {
      throw new Error('自定义 API 配置不完整，请在账号管理中保存模型名称、接口地址和 API Key。');
    }
    return {
      source,
      snapshot: null as PlatformModelSnapshot | null,
      costCents: 0,
      provider: 'openai_compatible' as const,
      baseUrl: custom.baseURL,
      apiKey: custom.apiKey,
      modelId: custom.modelName,
      reasoningDepth: settings?.defaultReasoningDepth || 'medium',
      allowPrivateAddress: false,
    };
  }

  const config = await resolvePlatformModel({
    selectedId: settings?.defaultPlatformModelConfigId,
    userDefaultId: settings?.defaultPlatformModelConfigId,
    operation: params.operation,
  });
  const snapshot = platformModelSnapshot(config);
  const apiKey = decryptSecret(snapshot.apiKeyEncrypted);
  if (!apiKey) throw new Error('所选平台模型未配置可用的 API Key，请联系管理员。');
  const configuredAdminBaseUrl = process.env.OPENAI_BASE_URL || '';
  return {
    source,
    snapshot,
    costCents: operationCostCents(params.operation, snapshot.multiplierBps),
    provider: snapshot.provider,
    baseUrl: snapshot.baseUrl,
    apiKey,
    modelId: snapshot.modelId,
    reasoningDepth: snapshot.reasoningDepth,
    allowPrivateAddress: process.env.ALLOW_PRIVATE_ADMIN_LLM === 'true'
      && Boolean(configuredAdminBaseUrl)
      && snapshot.baseUrl.replace(/\/$/, '') === configuredAdminBaseUrl.replace(/\/$/, ''),
  };
}

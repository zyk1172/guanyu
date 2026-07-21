import type { PlatformModelConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrCreateAppSetting } from '@/lib/billing';
import {
  formatCreditCents,
  localizedModelText,
  operationCapabilityField,
  operationCostCents,
  type PlatformModelOperation,
  type PlatformModelProvider,
  type PlatformModelSearchMode,
} from '@/lib/platform-model-core.mjs';

export type PlatformModelSnapshot = {
  configId: string;
  configKey: string;
  provider: PlatformModelProvider;
  displayName: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  modelId: string;
  reasoningDepth: string;
  searchMode: PlatformModelSearchMode;
  multiplierBps: number;
  configVersion: number;
  inputPriceMicrosPerMillion: number;
  outputPriceMicrosPerMillion: number;
  nativeSearchPriceMicrosPerRequest: number;
  capturedAt: string;
};

export type PublicPlatformModel = {
  id: string;
  displayName: string;
  description: string;
  provider: PlatformModelProvider;
  searchMode: PlatformModelSearchMode;
  supportsWebSearch: boolean;
  contentOnlyAnalysis: boolean;
  recommended: boolean;
  isDefault: boolean;
  isUserDefault: boolean;
  estimatedCostCents: number;
  estimatedCost: string;
};

function provider(value: string): PlatformModelProvider {
  if (value === 'openai' || value === 'gemini' || value === 'anthropic') return value;
  return 'openai_compatible';
}

function searchMode(value: string): PlatformModelSearchMode {
  if (value === 'native' || value === 'none') return value;
  return 'platform';
}

export async function ensurePlatformModelBaseline() {
  const existing = await prisma.platformModelConfig.count({ where: { archivedAt: null } });
  if (existing > 0) return;
  const legacy = await getOrCreateAppSetting();
  await prisma.platformModelConfig.upsert({
    where: { configKey: 'deepseek-v4-pro-baseline' },
    update: {},
    create: {
      configKey: 'deepseek-v4-pro-baseline',
      provider: 'openai_compatible',
      displayName: /deepseek/i.test(legacy.adminModelName || '') ? 'DeepSeek V4 Pro' : (legacy.adminModelName || 'DeepSeek V4 Pro'),
      description: '观隅基准平台模型，使用现有平台联网搜索。',
      baseUrl: legacy.adminLlmBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
      apiKeyEncrypted: legacy.adminLlmApiKeyEncrypted,
      modelId: legacy.adminModelName || process.env.PLATFORM_DEFAULT_MODEL_ID || process.env.OPENAI_MODEL_DEFAULT || 'deepseek-v4-pro',
      reasoningDepth: 'medium',
      searchMode: 'platform',
      creditMultiplierBps: 100,
      isRecommended: true,
      isDefault: true,
      sortOrder: 0,
    },
  });
}

export function platformModelSnapshot(config: PlatformModelConfig): PlatformModelSnapshot {
  return {
    configId: config.id,
    configKey: config.configKey,
    provider: provider(config.provider),
    displayName: config.displayName,
    baseUrl: config.baseUrl,
    apiKeyEncrypted: config.apiKeyEncrypted || '',
    modelId: config.modelId,
    reasoningDepth: config.reasoningDepth,
    searchMode: searchMode(config.searchMode),
    multiplierBps: config.creditMultiplierBps,
    configVersion: config.configVersion,
    inputPriceMicrosPerMillion: config.inputPriceMicrosPerMillion,
    outputPriceMicrosPerMillion: config.outputPriceMicrosPerMillion,
    nativeSearchPriceMicrosPerRequest: config.nativeSearchPriceMicrosPerRequest,
    capturedAt: new Date().toISOString(),
  };
}

export function encodePlatformModelSnapshot(snapshot: PlatformModelSnapshot) {
  return JSON.stringify(snapshot);
}

export function decodePlatformModelSnapshot(value: string | null | undefined): PlatformModelSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed?.configId || !parsed?.modelId || !parsed?.baseUrl || !parsed?.provider) return null;
    return {
      configId: String(parsed.configId),
      configKey: String(parsed.configKey || ''),
      provider: provider(String(parsed.provider)),
      displayName: String(parsed.displayName || parsed.modelId),
      baseUrl: String(parsed.baseUrl),
      apiKeyEncrypted: String(parsed.apiKeyEncrypted || ''),
      modelId: String(parsed.modelId),
      reasoningDepth: String(parsed.reasoningDepth || 'medium'),
      searchMode: searchMode(String(parsed.searchMode)),
      multiplierBps: Number.isSafeInteger(parsed.multiplierBps) ? parsed.multiplierBps : 100,
      configVersion: Number.isSafeInteger(parsed.configVersion) ? parsed.configVersion : 1,
      inputPriceMicrosPerMillion: Number.isSafeInteger(parsed.inputPriceMicrosPerMillion) ? parsed.inputPriceMicrosPerMillion : 0,
      outputPriceMicrosPerMillion: Number.isSafeInteger(parsed.outputPriceMicrosPerMillion) ? parsed.outputPriceMicrosPerMillion : 0,
      nativeSearchPriceMicrosPerRequest: Number.isSafeInteger(parsed.nativeSearchPriceMicrosPerRequest) ? parsed.nativeSearchPriceMicrosPerRequest : 0,
      capturedAt: String(parsed.capturedAt || ''),
    };
  } catch {
    return null;
  }
}

export async function resolvePlatformModel(params: {
  selectedId?: string | null;
  userDefaultId?: string | null;
  operation: PlatformModelOperation;
  requireVisible?: boolean;
}) {
  await ensurePlatformModelBaseline();
  const capability = operationCapabilityField(params.operation);
  const commonWhere = {
    archivedAt: null,
    isEnabled: true,
    ...(params.requireVisible === false ? {} : { isVisibleToUsers: true }),
    [capability]: true,
  } as any;

  const requestedId = String(params.selectedId || params.userDefaultId || '').trim();
  if (requestedId) {
    const requested = await prisma.platformModelConfig.findFirst({
      where: { id: requestedId, ...commonWhere },
    });
    if (requested) return requested;
    if (params.selectedId) throw new Error('所选模型暂时不可用，本次未扣除点数。');
  }

  const fallback = await prisma.platformModelConfig.findFirst({
    where: { ...commonWhere, isDefault: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  }) || await prisma.platformModelConfig.findFirst({
    where: commonWhere,
    orderBy: [{ isRecommended: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (!fallback) throw new Error('当前没有可用于此操作的平台模型，本次未扣除点数。');
  return fallback;
}

export async function listPublicPlatformModels(params: {
  operation: PlatformModelOperation;
  locale: string;
  userDefaultId?: string | null;
}) {
  await ensurePlatformModelBaseline();
  const capability = operationCapabilityField(params.operation);
  const models = await prisma.platformModelConfig.findMany({
    where: {
      archivedAt: null,
      isEnabled: true,
      isVisibleToUsers: true,
      [capability]: true,
    },
    orderBy: [{ isRecommended: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return models.map((model): PublicPlatformModel => {
    const estimatedCostCents = operationCostCents(params.operation, model.creditMultiplierBps);
    const mode = searchMode(model.searchMode);
    return {
      id: model.id,
      displayName: localizedModelText(model.displayName, model.displayNameI18nJson, params.locale),
      description: localizedModelText(model.description, model.descriptionI18nJson, params.locale),
      provider: provider(model.provider),
      searchMode: mode,
      supportsWebSearch: mode !== 'none',
      contentOnlyAnalysis: params.operation === 'analysis' && mode === 'none',
      recommended: model.isRecommended,
      isDefault: model.isDefault,
      isUserDefault: model.id === params.userDefaultId,
      estimatedCostCents,
      estimatedCost: formatCreditCents(estimatedCostCents),
    };
  });
}

export function safeAdminPlatformModel(config: PlatformModelConfig) {
  const { apiKeyEncrypted, ...safe } = config;
  return { ...safe, hasApiKey: Boolean(apiKeyEncrypted) };
}

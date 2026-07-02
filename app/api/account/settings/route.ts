import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/secret';
import { isByokPlan } from '@/lib/billing';

const VALID_ANALYSIS_MODES = new Set(['quick', 'deep']);
const VALID_THINKING_DEPTHS = new Set(['none', 'low', 'medium', 'high', 'extreme', 'quick', 'standard', 'deep', 'exhaustive']);
const VALID_TAVILY_DEPTHS = new Set(['basic', 'advanced']);
const VALID_AUDIENCE_THEMES = new Set(['teen', 'youth', 'mature', 'senior']);

function normalizeThinkingDepth(depth: unknown) {
  if (typeof depth !== 'string') return 'medium';
  if (!VALID_THINKING_DEPTHS.has(depth)) return 'medium';
  const legacyMap: Record<string, string> = {
    quick: 'low',
    standard: 'medium',
    deep: 'high',
    exhaustive: 'extreme',
  };
  return legacyMap[depth] || depth;
}

function withSafeModelFields<T extends { llmApiKeyEncrypted?: string | null; tavilyApiKeyEncrypted?: string | null; serperApiKeyEncrypted?: string | null }>(settings: T) {
  const { llmApiKeyEncrypted, tavilyApiKeyEncrypted, serperApiKeyEncrypted, ...safeSettings } = settings;
  return {
    ...safeSettings,
    hasLlmApiKey: Boolean(llmApiKeyEncrypted),
    hasTavilyApiKey: Boolean(tavilyApiKeyEncrypted),
    hasSerperApiKey: Boolean(serperApiKeyEncrypted),
  };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再操作。' }, { status: 401 });
    }

    const userId = user.id;
    const [settings, account, isSuperAdmin] = await Promise.all([
      prisma.userSettings.findUnique({
        where: { userId },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          planType: true,
          createdAt: true,
        },
      }),
      getSuperAdminStatus(userId),
    ]);

    if (!account) {
      return NextResponse.json({ error: '账号不存在，请重新登录。' }, { status: 401 });
    }

    if (!settings) {
      // 预防性创建：如果用户不小心丢了配置
      const newSettings = await prisma.userSettings.create({
        data: {
          userId,
            defaultModelName: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
            llmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            defaultReasoningDepth: 'medium',
            defaultAnalysisMode: 'quick',
            defaultIsPublic: true,
          defaultSaveResult: true,
          defaultEnableCharts: true,
        },
      });
      return NextResponse.json({
        ...withSafeModelFields(newSettings),
        account,
        isSuperAdmin,
        canUseOwnApi: isSuperAdmin || isByokPlan(account.planType),
      });
    }

    return NextResponse.json({
      ...withSafeModelFields(settings),
      account,
      isSuperAdmin,
      canUseOwnApi: isSuperAdmin || isByokPlan(account.planType),
    });
  } catch (error: any) {
    console.error('GET settings error:', error);
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再操作。' }, { status: 401 });
    }

    const userId = user.id;
    const body = await request.json();
    const [account, isSuperAdmin] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { planType: true },
      }),
      getSuperAdminStatus(userId),
    ]);
    const canUseOwnApi = isSuperAdmin || isByokPlan(account?.planType);

    const {
      defaultModelName,
      llmBaseUrl,
      llmApiKey,
      enableTavilySearch,
      tavilyApiKey,
      tavilySearchDepth,
      enableSerperSearch,
      serperApiKey,
      defaultReasoningDepth,
      defaultAnalysisMode,
      defaultAudienceTheme,
      defaultIsPublic,
      defaultSaveResult,
      defaultEnableCharts,
    } = body;
    const safeAnalysisMode = VALID_ANALYSIS_MODES.has(defaultAnalysisMode) ? defaultAnalysisMode : 'quick';
    const safeReasoningDepth = normalizeThinkingDepth(defaultReasoningDepth);
    const safeAudienceTheme = VALID_AUDIENCE_THEMES.has(defaultAudienceTheme) ? defaultAudienceTheme : 'youth';

    const trimmedApiKey = typeof llmApiKey === 'string' ? llmApiKey.trim() : '';
    const trimmedTavilyApiKey = typeof tavilyApiKey === 'string' ? tavilyApiKey.trim() : '';
    const trimmedSerperApiKey = typeof serperApiKey === 'string' ? serperApiKey.trim() : '';
    const safeTavilyDepth = VALID_TAVILY_DEPTHS.has(tavilySearchDepth) ? tavilySearchDepth : 'basic';
    const hasOwnApiUpdate = Boolean(
      trimmedApiKey ||
      trimmedTavilyApiKey ||
      trimmedSerperApiKey
    );
    if (!canUseOwnApi && hasOwnApiUpdate) {
      return NextResponse.json({
        error: '只有 30 元买断账号可以填写自己的大模型和联网 API。点数账号使用管理员统一模型与搜索额度。',
      }, { status: 403 });
    }
    const safeModelName = String(defaultModelName || '').trim() || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o';
    const safeLlmBaseUrl = String(llmBaseUrl || '').trim() || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    const apiKeyUpdate = trimmedApiKey
      ? { llmApiKeyEncrypted: encryptSecret(trimmedApiKey) }
      : {};
    const tavilyApiKeyUpdate = trimmedTavilyApiKey
      ? { tavilyApiKeyEncrypted: encryptSecret(trimmedTavilyApiKey) }
      : {};
    const serperApiKeyUpdate = trimmedSerperApiKey
      ? { serperApiKeyEncrypted: encryptSecret(trimmedSerperApiKey) }
      : {};

    const updatedSettings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(canUseOwnApi ? {
          defaultModelName: safeModelName,
          llmBaseUrl: safeLlmBaseUrl,
        } : {}),
        ...apiKeyUpdate,
        ...(canUseOwnApi ? {
          enableTavilySearch: Boolean(enableTavilySearch),
          tavilySearchDepth: safeTavilyDepth,
        } : {}),
        ...tavilyApiKeyUpdate,
        ...(canUseOwnApi ? {
          enableSerperSearch: Boolean(enableSerperSearch),
        } : {}),
        ...serperApiKeyUpdate,
        defaultAudienceTheme: safeAudienceTheme,
        defaultReasoningDepth: safeReasoningDepth,
        defaultIsPublic,
        defaultSaveResult,
        defaultEnableCharts,
      },
      create: {
        userId,
        defaultModelName: canUseOwnApi ? safeModelName : (process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o'),
        llmBaseUrl: canUseOwnApi ? safeLlmBaseUrl : (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
        llmApiKeyEncrypted: canUseOwnApi && trimmedApiKey ? encryptSecret(trimmedApiKey) : null,
        enableTavilySearch: canUseOwnApi ? Boolean(enableTavilySearch) : false,
        tavilyApiKeyEncrypted: canUseOwnApi && trimmedTavilyApiKey ? encryptSecret(trimmedTavilyApiKey) : null,
        tavilySearchDepth: safeTavilyDepth,
        enableSerperSearch: canUseOwnApi ? Boolean(enableSerperSearch) : false,
        serperApiKeyEncrypted: canUseOwnApi && trimmedSerperApiKey ? encryptSecret(trimmedSerperApiKey) : null,
        defaultAudienceTheme: safeAudienceTheme,
        defaultReasoningDepth: safeReasoningDepth,
        defaultAnalysisMode: safeAnalysisMode,
        defaultIsPublic: defaultIsPublic !== undefined ? defaultIsPublic : true,
        defaultSaveResult: defaultSaveResult !== undefined ? defaultSaveResult : true,
        defaultEnableCharts: defaultEnableCharts !== undefined ? defaultEnableCharts : true,
      },
    });

    if (isSuperAdmin && canUseOwnApi) {
      const appSettingUpdate: any = {
        adminModelName: safeModelName,
        adminLlmBaseUrl: safeLlmBaseUrl,
        enableAdminTavilySearch: Boolean(enableTavilySearch),
        enableAdminSerperSearch: Boolean(enableSerperSearch),
      };
      if (trimmedApiKey) appSettingUpdate.adminLlmApiKeyEncrypted = encryptSecret(trimmedApiKey);
      if (trimmedTavilyApiKey) appSettingUpdate.adminTavilyApiKeyEncrypted = encryptSecret(trimmedTavilyApiKey);
      if (trimmedSerperApiKey) appSettingUpdate.adminSerperApiKeyEncrypted = encryptSecret(trimmedSerperApiKey);

      await prisma.appSetting.upsert({
        where: { id: 'global' },
        update: appSettingUpdate,
        create: { id: 'global', ...appSettingUpdate },
      });
    }

    return NextResponse.json({ ...withSafeModelFields(updatedSettings), canUseOwnApi });
  } catch (error: any) {
    console.error('PATCH settings error:', error);
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 });
  }
}

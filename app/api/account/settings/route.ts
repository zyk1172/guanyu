import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/secret';
import { getOrCreateAppSetting, hasActivePro } from '@/lib/billing';
import { cacheDel, CACHE_KEYS } from '@/lib/cache';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { getEffectiveRssSourceConfig, getRssSourceCatalog, normalizeRssSourceConfig } from '@/lib/rss-core.mjs';
import { assertPublicOutboundUrl } from '@/lib/safe-outbound';

const VALID_ANALYSIS_MODES = new Set(['quick', 'deep']);
const VALID_THINKING_DEPTHS = new Set(['none', 'low', 'medium', 'high', 'extreme', 'quick', 'standard', 'deep', 'exhaustive']);
const VALID_TAVILY_DEPTHS = new Set(['basic', 'advanced']);
const VALID_REPORT_LANGUAGES = new Set(['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'it-IT']);

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
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再操作。' }, { status: 401 });
    }

    const userId = user.id;
    const [settings, account, isSuperAdmin, appSetting] = await Promise.all([
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
          proAccessExpiresAt: true,
          createdAt: true,
        },
      }),
      getSuperAdminStatus(userId),
      getOrCreateAppSetting(),
    ]);

    if (!account) {
      return NextResponse.json({ error: '账号不存在，请重新登录。' }, { status: 401 });
    }

    const canUseOwnApi = isSuperAdmin || hasActivePro(account);
    const rssSourceCatalog = getRssSourceCatalog();

    if (!settings) {
      // 预防性创建：如果用户不小心丢了配置
      const newSettings = await prisma.userSettings.create({
        data: {
          userId,
            defaultModelName: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
            llmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            defaultReasoningDepth: 'medium',
            defaultAnalysisMode: 'deep',
            defaultReportLanguage: 'zh-CN',
            defaultIsPublic: true,
          defaultSaveResult: true,
          defaultEnableCharts: true,
        },
      });
      const safeSettings = withSafeModelFields(newSettings);
      const rssFeedConfig = getEffectiveRssSourceConfig({
        canUseOwnApi,
        adminConfig: appSetting.adminRssFeedIdsJson,
        personalConfig: newSettings.rssFeedUrlsJson,
      });
      return NextResponse.json({
        ...safeSettings,
        ...(!canUseOwnApi ? {
          defaultModelName: appSetting.adminModelName,
          llmBaseUrl: appSetting.adminLlmBaseUrl,
          enableTavilySearch: appSetting.enableAdminTavilySearch,
          enableSerperSearch: appSetting.enableAdminSerperSearch,
          hasLlmApiKey: Boolean(appSetting.adminLlmApiKeyEncrypted),
          hasTavilyApiKey: Boolean(appSetting.adminTavilyApiKeyEncrypted),
          hasSerperApiKey: Boolean(appSetting.adminSerperApiKeyEncrypted),
        } : {}),
        account,
        isSuperAdmin,
        canUseOwnApi,
        modelConfigSource: canUseOwnApi ? 'personal' : 'admin',
        rssFeedConfig,
        rssConfigSource: canUseOwnApi ? 'personal' : 'admin',
        rssSourceCatalog,
      });
    }

    const safeSettings = withSafeModelFields(settings);
    const rssFeedConfig = getEffectiveRssSourceConfig({
      canUseOwnApi,
      adminConfig: appSetting.adminRssFeedIdsJson,
      personalConfig: settings.rssFeedUrlsJson,
    });
    return NextResponse.json({
      ...safeSettings,
      ...(!canUseOwnApi ? {
        defaultModelName: appSetting.adminModelName,
        llmBaseUrl: appSetting.adminLlmBaseUrl,
        enableTavilySearch: appSetting.enableAdminTavilySearch,
        enableSerperSearch: appSetting.enableAdminSerperSearch,
        hasLlmApiKey: Boolean(appSetting.adminLlmApiKeyEncrypted),
        hasTavilyApiKey: Boolean(appSetting.adminTavilyApiKeyEncrypted),
        hasSerperApiKey: Boolean(appSetting.adminSerperApiKeyEncrypted),
      } : {}),
      account,
      isSuperAdmin,
      canUseOwnApi,
      modelConfigSource: canUseOwnApi ? 'personal' : 'admin',
      rssFeedConfig,
      rssConfigSource: canUseOwnApi ? 'personal' : 'admin',
      rssSourceCatalog,
    });
  } catch (error: any) {
    console.error('GET settings error:', error);
    return NextResponse.json({ error: '获取设置失败' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再操作。' }, { status: 401 });
    }

    const userId = user.id;
    const body = await request.json();
    const [account, isSuperAdmin] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { planType: true, proAccessExpiresAt: true },
      }),
      getSuperAdminStatus(userId),
    ]);
    const canUseOwnApi = isSuperAdmin || hasActivePro(account || {});

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
      defaultReportLanguage,
      defaultAnalysisMode,
      defaultIsPublic,
      defaultSaveResult,
      defaultEnableCharts,
      modelSource,
      rssFeedConfig,
    } = body;
    const safeAnalysisMode = VALID_ANALYSIS_MODES.has(defaultAnalysisMode) ? defaultAnalysisMode : 'deep';
    const safeReasoningDepth = normalizeThinkingDepth(defaultReasoningDepth);
    const safeReportLanguage = VALID_REPORT_LANGUAGES.has(defaultReportLanguage) ? defaultReportLanguage : 'zh-CN';

    const trimmedApiKey = typeof llmApiKey === 'string' ? llmApiKey.trim() : '';
    const trimmedTavilyApiKey = typeof tavilyApiKey === 'string' ? tavilyApiKey.trim() : '';
    const trimmedSerperApiKey = typeof serperApiKey === 'string' ? serperApiKey.trim() : '';
    const safeTavilyDepth = VALID_TAVILY_DEPTHS.has(tavilySearchDepth) ? tavilySearchDepth : 'basic';
    const hasOwnApiUpdate = Boolean(
      trimmedApiKey ||
      trimmedTavilyApiKey ||
      trimmedSerperApiKey
    );
    const hasRssConfigUpdate = rssFeedConfig !== undefined;
    const normalizedRssFeedConfig = normalizeRssSourceConfig(rssFeedConfig);
    if (!canUseOwnApi && (hasOwnApiUpdate || hasRssConfigUpdate)) {
      return NextResponse.json({
        error: '自定义模型、搜索与 RSS 仅对有效 Pro 专业权益开放。',
      }, { status: 403 });
    }
    const safeModelName = String(defaultModelName || '').trim() || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o';
    const safeLlmBaseUrl = String(llmBaseUrl || '').trim() || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    if (canUseOwnApi) {
      try {
        await assertPublicOutboundUrl(safeLlmBaseUrl, { requireHttps: process.env.NODE_ENV === 'production' });
      } catch (error: any) {
        return NextResponse.json({ error: error?.message || '大模型接口地址不符合安全要求。' }, { status: 400 });
      }
    }

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
        ...(canUseOwnApi && hasRssConfigUpdate ? { rssFeedUrlsJson: JSON.stringify(normalizedRssFeedConfig) } : {}),
        defaultReasoningDepth: safeReasoningDepth,
        defaultReportLanguage: safeReportLanguage,
        defaultIsPublic,
        defaultSaveResult,
        defaultEnableCharts,
        modelSource: canUseOwnApi && modelSource === 'custom' ? 'custom' : 'platform',
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
        defaultReasoningDepth: safeReasoningDepth,
        defaultReportLanguage: safeReportLanguage,
        defaultAnalysisMode: safeAnalysisMode,
        defaultIsPublic: defaultIsPublic !== undefined ? defaultIsPublic : true,
        defaultSaveResult: defaultSaveResult !== undefined ? defaultSaveResult : true,
        defaultEnableCharts: defaultEnableCharts !== undefined ? defaultEnableCharts : true,
        modelSource: canUseOwnApi && modelSource === 'custom' ? 'custom' : 'platform',
        rssFeedUrlsJson: canUseOwnApi && hasRssConfigUpdate ? JSON.stringify(normalizedRssFeedConfig) : '[]',
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
      if (hasRssConfigUpdate) appSettingUpdate.adminRssFeedIdsJson = JSON.stringify(normalizedRssFeedConfig);

      await prisma.appSetting.upsert({
        where: { id: 'global' },
        update: appSettingUpdate,
        create: { id: 'global', ...appSettingUpdate },
      });
      await cacheDel(CACHE_KEYS.appSetting);
    }

    return NextResponse.json({ ...withSafeModelFields(updatedSettings), canUseOwnApi });
  } catch (error: any) {
    console.error('PATCH settings error:', error);
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 });
  }
}

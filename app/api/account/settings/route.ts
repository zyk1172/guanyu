import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/secret';

const VALID_ANALYSIS_MODES = new Set(['quick', 'deep']);
const VALID_THINKING_DEPTHS = new Set(['none', 'low', 'medium', 'high', 'extreme', 'quick', 'standard', 'deep', 'exhaustive']);

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

function withSafeModelFields<T extends { llmApiKeyEncrypted?: string | null }>(settings: T) {
  const { llmApiKeyEncrypted, ...safeSettings } = settings;
  return {
    ...safeSettings,
    hasLlmApiKey: Boolean(llmApiKeyEncrypted),
  };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再操作。' }, { status: 401 });
    }

    const userId = user.id;
    const [settings, account] = await Promise.all([
      prisma.userSettings.findUnique({
        where: { userId },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      }),
    ]);

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
      return NextResponse.json({ ...withSafeModelFields(newSettings), account });
    }

    return NextResponse.json({ ...withSafeModelFields(settings), account });
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

    const {
      defaultModelName,
      llmBaseUrl,
      llmApiKey,
      defaultReasoningDepth,
      defaultAnalysisMode,
      defaultIsPublic,
      defaultSaveResult,
      defaultEnableCharts,
    } = body;
    const safeAnalysisMode = VALID_ANALYSIS_MODES.has(defaultAnalysisMode) ? defaultAnalysisMode : 'quick';
    const safeReasoningDepth = normalizeThinkingDepth(defaultReasoningDepth);

    const trimmedApiKey = typeof llmApiKey === 'string' ? llmApiKey.trim() : '';
    const apiKeyUpdate = trimmedApiKey
      ? { llmApiKeyEncrypted: encryptSecret(trimmedApiKey) }
      : {};

    const updatedSettings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        defaultModelName,
        llmBaseUrl: llmBaseUrl || 'https://api.openai.com/v1',
        ...apiKeyUpdate,
        defaultReasoningDepth: safeReasoningDepth,
        defaultIsPublic,
        defaultSaveResult,
        defaultEnableCharts,
      },
      create: {
        userId,
        defaultModelName: defaultModelName || 'gpt-4o',
        llmBaseUrl: llmBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        llmApiKeyEncrypted: trimmedApiKey ? encryptSecret(trimmedApiKey) : null,
        defaultReasoningDepth: safeReasoningDepth,
        defaultAnalysisMode: safeAnalysisMode,
        defaultIsPublic: defaultIsPublic !== undefined ? defaultIsPublic : true,
        defaultSaveResult: defaultSaveResult !== undefined ? defaultSaveResult : true,
        defaultEnableCharts: defaultEnableCharts !== undefined ? defaultEnableCharts : true,
      },
    });

    return NextResponse.json(withSafeModelFields(updatedSettings));
  } catch (error: any) {
    console.error('PATCH settings error:', error);
    return NextResponse.json({ error: '更新设置失败' }, { status: 500 });
  }
}

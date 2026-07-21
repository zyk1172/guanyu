import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/secret';
import { bootstrapPlatformModelSchema } from '@/lib/platform-model-schema';
import { ensurePlatformModelBaseline, safeAdminPlatformModel } from '@/lib/platform-models';
import {
  PLATFORM_MODEL_PROVIDERS,
  PLATFORM_MODEL_SEARCH_MODES,
  parseMultiplierToBps,
  type PlatformModelProvider,
  type PlatformModelSearchMode,
} from '@/lib/platform-model-core.mjs';
import { testModelConnection } from '@/lib/model-runtime';

const REASONING_DEPTHS = new Set(['none', 'low', 'medium', 'high', 'extreme']);
const MAX_INT = 2_147_483_647;

async function requireSuperAdmin(request: Request) {
  const user = await getCurrentUser(request);
  if (!user || !(await getSuperAdminStatus(user.id))) return null;
  return user;
}

function string(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function jsonMap(value: unknown) {
  if (!value) return '{}';
  let parsed: unknown;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('多语言名称和说明必须是有效的 JSON 对象。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('多语言名称和说明必须是对象。');
  return JSON.stringify(Object.fromEntries(Object.entries(parsed).map(([key, text]) => [String(key).slice(0, 20), string(text, 500)])));
}

function nonNegativeInt(value: unknown, field: string) {
  const parsed = Number.parseInt(String(value || 0), 10) || 0;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_INT) throw new Error(`${field}必须是有效的非负整数。`);
  return parsed;
}

function reasoningDepth(value: unknown) {
  const selected = string(value, 20) || 'medium';
  if (!REASONING_DEPTHS.has(selected)) throw new Error('不支持的思考强度。');
  return selected;
}

function modelBaseUrl(value: unknown) {
  const raw = string(value, 1000).replace(/\/$/, '');
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('模型接口只允许 HTTP 或 HTTPS。');
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new Error('生产环境模型接口必须使用 HTTPS。');
  return raw;
}

function validateProvider(value: unknown): PlatformModelProvider {
  const selected = string(value, 40) || 'openai_compatible';
  if (!(PLATFORM_MODEL_PROVIDERS as readonly string[]).includes(selected)) throw new Error('不支持的模型服务商。');
  return selected as PlatformModelProvider;
}

function validateSearchMode(value: unknown, provider: PlatformModelProvider): PlatformModelSearchMode {
  const selected = string(value, 20) || 'platform';
  if (!(PLATFORM_MODEL_SEARCH_MODES as readonly string[]).includes(selected)) throw new Error('不支持的联网搜索模式。');
  if (selected === 'native' && provider === 'openai_compatible') {
    throw new Error('OpenAI-compatible 配置无法声明原生联网，请选择平台搜索或不联网。');
  }
  return selected as PlatformModelSearchMode;
}

function configData(body: any, existing?: { apiKeyEncrypted: string | null }) {
  const provider = validateProvider(body.provider);
  const searchMode = validateSearchMode(body.searchMode, provider);
  const apiKey = string(body.apiKey, 5000);
  const multiplierValue = body.creditMultiplier !== undefined && body.creditMultiplier !== null
    ? body.creditMultiplier
    : Number.isSafeInteger(body.creditMultiplierBps)
      ? String(body.creditMultiplierBps / 100)
      : '1';
  const multiplierBps = parseMultiplierToBps(multiplierValue);
  const displayName = string(body.displayName, 120);
  const modelId = string(body.modelId, 240);
  if (!displayName) throw new Error('请填写用户可见的模型名称。');
  if (!modelId) throw new Error('请填写实际模型 ID。');
  if (!apiKey && !existing?.apiKeyEncrypted) throw new Error('请填写模型 API Key。');
  return {
    provider,
    displayName,
    description: string(body.description, 1000),
    displayNameI18nJson: jsonMap(body.displayNameI18nJson || body.displayNameI18n || {}),
    descriptionI18nJson: jsonMap(body.descriptionI18nJson || body.descriptionI18n || {}),
    baseUrl: modelBaseUrl(body.baseUrl),
    apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : existing?.apiKeyEncrypted,
    modelId,
    reasoningDepth: reasoningDepth(body.reasoningDepth),
    searchMode,
    supportsAnalysis: body.supportsAnalysis !== false,
    supportsCompletion: body.supportsCompletion !== false,
    supportsFollowup: body.supportsFollowup !== false,
    creditMultiplierBps: multiplierBps,
    inputPriceMicrosPerMillion: nonNegativeInt(body.inputPriceMicrosPerMillion, '输入成本'),
    outputPriceMicrosPerMillion: nonNegativeInt(body.outputPriceMicrosPerMillion, '输出成本'),
    nativeSearchPriceMicrosPerRequest: nonNegativeInt(body.nativeSearchPriceMicrosPerRequest, '原生搜索成本'),
    isEnabled: body.isEnabled !== false,
    isVisibleToUsers: body.isVisibleToUsers !== false,
    isRecommended: Boolean(body.isRecommended),
    sortOrder: Math.min(1_000_000, Math.max(-1_000_000, Number.parseInt(String(body.sortOrder || 0), 10) || 0)),
  };
}

function generatedKey(displayName: string) {
  const stem = displayName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'platform-model';
  return `${stem}-${crypto.randomUUID().slice(0, 8)}`;
}

async function initialize() {
  await bootstrapPlatformModelSchema();
  await ensurePlatformModelBaseline();
}

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: '你没有权限管理平台模型。' }, { status: 403 });
  try {
    await initialize();
    const [models, groupedUsage] = await Promise.all([
      prisma.platformModelConfig.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.modelUsageEvent.groupBy({
        by: ['platformModelConfigIdSnapshot', 'operation', 'status'],
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        _count: { _all: true },
        _sum: {
          creditCostCents: true,
          inputTokens: true,
          outputTokens: true,
          searchRequestCount: true,
          nativeSearchRequestCount: true,
          estimatedExternalCostMicros: true,
          durationMs: true,
        },
      }),
    ]);
    return NextResponse.json({ models: models.map(safeAdminPlatformModel), usage: groupedUsage });
  } catch (error) {
    console.error('Load platform model admin failed:', error);
    return NextResponse.json({ error: '平台模型管理数据加载失败。' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: '你没有权限管理平台模型。' }, { status: 403 });
  try {
    await initialize();
    const body = await request.json();
    const data = configData(body);
    const isDefault = Boolean(body.isDefault);
    if (isDefault && (!data.isEnabled || !data.isVisibleToUsers || !data.supportsAnalysis)) {
      throw new Error('默认模型必须启用、对用户可见并支持新闻分析。');
    }
    const model = await prisma.$transaction(async (tx) => {
      if (isDefault) await tx.platformModelConfig.updateMany({ where: { archivedAt: null, isDefault: true }, data: { isDefault: false } });
      return tx.platformModelConfig.create({
        data: { ...data, configKey: generatedKey(data.displayName), isDefault },
      });
    });
    return NextResponse.json({ model: safeAdminPlatformModel(model) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '新增平台模型失败。' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: '你没有权限管理平台模型。' }, { status: 403 });
  try {
    await initialize();
    const body = await request.json();
    const id = string(body.id, 120);
    const action = string(body.action, 40) || 'update';
    const existing = await prisma.platformModelConfig.findFirst({ where: { id, archivedAt: null } });
    if (!existing) return NextResponse.json({ error: '平台模型配置不存在。' }, { status: 404 });

    if (action === 'test') {
      const apiKey = decryptSecret(existing.apiKeyEncrypted);
      if (!apiKey) return NextResponse.json({ error: '该模型没有可用的 API Key。' }, { status: 400 });
      const result = await testModelConnection({
        provider: validateProvider(existing.provider),
        baseUrl: existing.baseUrl,
        apiKey,
        modelId: existing.modelId,
        reasoningDepth: existing.reasoningDepth,
        allowPrivateAddress: process.env.NODE_ENV !== 'production',
      });
      const tested = await prisma.platformModelConfig.update({
        where: { id },
        data: {
          lastTestStatus: result.passed ? 'passed' : 'failed',
          lastTestMessage: result.passed ? '连接成功。' : `连接失败（${result.errorCode || result.status}）。`,
          lastTestedAt: new Date(),
        },
      });
      return NextResponse.json({ model: safeAdminPlatformModel(tested), passed: result.passed });
    }

    if (action === 'setDefault') {
      if (!existing.isEnabled || !existing.isVisibleToUsers || !existing.supportsAnalysis) throw new Error('默认模型必须启用、对用户可见并支持新闻分析。');
      const model = await prisma.$transaction(async (tx) => {
        await tx.platformModelConfig.updateMany({ where: { archivedAt: null, isDefault: true }, data: { isDefault: false } });
        return tx.platformModelConfig.update({ where: { id }, data: { isDefault: true } });
      });
      return NextResponse.json({ model: safeAdminPlatformModel(model) });
    }

    const data = configData(body, existing);
    if (existing.isDefault && (!data.isEnabled || !data.isVisibleToUsers || !data.supportsAnalysis)) {
      throw new Error('请先将其他模型设为默认，再停用、隐藏或取消当前默认模型的新闻分析能力。');
    }
    const requestedDefault = Boolean(body.isDefault);
    if (requestedDefault && (!data.isEnabled || !data.isVisibleToUsers || !data.supportsAnalysis)) {
      throw new Error('默认模型必须启用、对用户可见并支持新闻分析。');
    }
    const model = await prisma.$transaction(async (tx) => {
      if (requestedDefault) await tx.platformModelConfig.updateMany({ where: { archivedAt: null, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.platformModelConfig.update({
        where: { id },
        data: { ...data, isDefault: requestedDefault || existing.isDefault, configVersion: { increment: 1 } },
      });
    });
    return NextResponse.json({ model: safeAdminPlatformModel(model) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '更新平台模型失败。' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireSuperAdmin(request);
  if (!admin) return NextResponse.json({ error: '你没有权限管理平台模型。' }, { status: 403 });
  try {
    await initialize();
    const id = string(new URL(request.url).searchParams.get('id'), 120);
    const existing = await prisma.platformModelConfig.findFirst({ where: { id, archivedAt: null } });
    if (!existing) return NextResponse.json({ error: '平台模型配置不存在。' }, { status: 404 });
    if (existing.isDefault) return NextResponse.json({ error: '默认模型不能删除，请先设置新的默认模型。' }, { status: 400 });
    await prisma.platformModelConfig.update({
      where: { id },
      data: { archivedAt: new Date(), isEnabled: false, isVisibleToUsers: false, configVersion: { increment: 1 } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '删除平台模型失败。' }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSuperAdminStatus } from '@/lib/admin';
import { getOrCreateAppSetting } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { cacheDel, CACHE_KEYS } from '@/lib/cache';
import { decryptSecret, encryptSecret } from '@/lib/secret';
import { paidSearchAllowed } from '@/lib/web-search-policy';
import { accessError, AccessError, guardAccountRequest, readAccessJson, requireAccount } from '@/lib/access';

async function requireAdmin(request: Request) {
  const user = await requireAccount(request);
  if (!await getSuperAdminStatus(user.id)) throw new AccessError('仅超级管理员可设置新闻搜索。', 403);
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [app, models] = await Promise.all([
      getOrCreateAppSetting(),
      prisma.platformModelConfig.findMany({
        where: { archivedAt: null, isEnabled: true, supportsAnalysis: true, apiKeyEncrypted: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, displayName: true },
      }),
    ]);
    return NextResponse.json({
      provider: app.newsSearchProvider,
      aiModelConfigId: app.newsSearchAiModelConfigId || '',
      hasKey: Boolean(decryptSecret(app.newsSearchDeepseekKeyEncrypted)),
      dailyLimit: app.newsSearchDailyLimit,
      paidAllowed: paidSearchAllowed(),
      models: models.map(model => ({ id: model.id, name: model.displayName })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accessError(error); }
}

const updateSchema = z.object({
  provider: z.enum(['free', 'deepseek']),
  aiModelConfigId: z.string().max(100),
  apiKey: z.string().trim().max(5000).optional(),
  clearKey: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(10000),
}).strict();

export async function PATCH(request: Request) {
  try {
    guardAccountRequest(request);
    await requireAdmin(request);
    const input = updateSchema.parse(await readAccessJson(request));
    const app = await getOrCreateAppSetting();
    if (input.provider === 'deepseek') {
      if (!paidSearchAllowed()) throw new AccessError('当前部署未启用付费搜索。');
      if (input.clearKey || (!input.apiKey && !decryptSecret(app.newsSearchDeepseekKeyEncrypted))) {
        throw new AccessError('请填写独立的 DeepSeek 搜索 API Key。');
      }
    }
    if (input.aiModelConfigId) {
      const model = await prisma.platformModelConfig.findFirst({
        where: { id: input.aiModelConfigId, archivedAt: null, isEnabled: true, supportsAnalysis: true },
        select: { apiKeyEncrypted: true },
      });
      if (!decryptSecret(model?.apiKeyEncrypted)) throw new AccessError('请选择已配置密钥的辅助模型。');
    }
    await prisma.appSetting.update({
      where: { id: app.id, newsSearchDeepseekKeyEncrypted: app.newsSearchDeepseekKeyEncrypted },
      data: {
        newsSearchProvider: input.provider,
        newsSearchDeepseekKeyEncrypted: input.clearKey ? null : input.apiKey ? encryptSecret(input.apiKey) : undefined,
        newsSearchAiModelConfigId: input.aiModelConfigId || null,
        newsSearchDailyLimit: input.dailyLimit,
      },
    });
    await cacheDel(CACHE_KEYS.appSetting);
    return NextResponse.json({ ok: true });
  } catch (error) { return accessError(error); }
}

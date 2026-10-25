import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSuperAdminStatus } from '@/lib/admin';
import { getOrCreateAppSetting } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { cacheDel, CACHE_KEYS } from '@/lib/cache';
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
      prisma.platformModelConfig.findMany({ where: { archivedAt: null, isEnabled: true, isVisibleToUsers: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, displayName: true, deepseekApiKeyEncrypted: true } }),
    ]);
    return NextResponse.json({ provider: app.newsSearchProvider, modelConfigId: app.newsSearchModelConfigId || '', dailyLimit: app.newsSearchDailyLimit, paidAllowed: paidSearchAllowed(), models: models.map(model => ({ id: model.id, name: model.displayName, hasKey: Boolean(model.deepseekApiKeyEncrypted) })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accessError(error); }
}
export async function PATCH(request: Request) {
  try {
    guardAccountRequest(request);
    await requireAdmin(request);
    const input = z.object({ provider: z.enum(['free', 'deepseek']), modelConfigId: z.string().max(100), dailyLimit: z.number().int().min(1).max(10000) }).strict().parse(await readAccessJson(request));
    if (input.provider === 'deepseek' && !paidSearchAllowed()) throw new AccessError('当前部署未启用付费搜索，请先启用 GUANYU_ALLOW_PAID_SEARCH。');
    if (input.modelConfigId) {
      const model = await prisma.platformModelConfig.findFirst({ where: { id: input.modelConfigId, archivedAt: null, isEnabled: true, isVisibleToUsers: true, deepseekApiKeyEncrypted: { not: null } }, select: { id: true } });
      if (!model) throw new AccessError('请选择一个已保存 DeepSeek 搜索密钥且可用的平台配置。');
    } else if (input.provider === 'deepseek') throw new AccessError('请先选择提供搜索密钥的平台配置。');
    await getOrCreateAppSetting();
    await prisma.appSetting.update({ where: { id: 'global' }, data: { newsSearchProvider: input.provider, newsSearchModelConfigId: input.modelConfigId || null, newsSearchDailyLimit: input.dailyLimit } });
    await cacheDel(CACHE_KEYS.appSetting);
    return NextResponse.json({ ok: true });
  } catch (error) { return accessError(error); }
}

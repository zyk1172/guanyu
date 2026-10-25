import { prisma } from './prisma';
import { getOrCreateAppSetting, hasActivePro } from './billing';
import { paidSearchAllowed } from './web-search-policy';
import type { NewsCapabilities } from './news-search-types';
import type { CurrentUser } from './auth';

export async function resolveNewsSearchAccess(user: CurrentUser | null) {
  const app = await getOrCreateAppSetting();
  const [personal, model] = await Promise.all([
    user ? prisma.user.findUnique({ where: { id: user.id }, select: { role: true, planType: true, proAccessExpiresAt: true, settings: { select: { deepseekApiKeyEncrypted: true } } } }) : null,
    user && app.newsSearchModelConfigId ? prisma.platformModelConfig.findFirst({ where: { id: app.newsSearchModelConfigId, archivedAt: null, isEnabled: true, isVisibleToUsers: true }, select: { id: true, deepseekApiKeyEncrypted: true, configVersion: true } }) : null,
  ]);
  const allowed = paidSearchAllowed();
  const personalKey = allowed && personal && (personal.role === 'super_admin' || hasActivePro(personal)) ? personal.settings?.deepseekApiKeyEncrypted : null;
  const platformKey = allowed ? model?.deepseekApiKeyEncrypted : null;
  const source = personalKey ? 'personal' : platformKey ? 'platform' : null;
  const encryptedKey = personalKey || platformKey || null;
  const capabilities: NewsCapabilities = {
    paidAllowed: allowed, deepseekAvailable: Boolean(encryptedKey), deepseekSource: source,
    defaultProvider: app.newsSearchProvider === 'deepseek' && encryptedKey ? 'deepseek' : 'free',
  };
  return { capabilities, encryptedKey, scope: source === 'personal' ? `personal:${user!.id}` : `platform:${model?.id || ''}`, dailyLimit: app.newsSearchDailyLimit ?? 200 };
}

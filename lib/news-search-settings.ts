import { decryptSecret } from './secret';
import { prisma } from './prisma';
import { getOrCreateAppSetting, hasActivePro } from './billing';
import { deepseekNewsSearchAllowed } from './web-search-policy';
import type { NewsCapabilities } from './news-search-types';
import type { CurrentUser } from './auth';

export async function resolveNewsSearchAccess(user: CurrentUser | null) {
  const [app, personal] = await Promise.all([
    getOrCreateAppSetting(),
    user ? prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, planType: true, proAccessExpiresAt: true, settings: { select: { deepseekApiKeyEncrypted: true, defaultPlatformModelConfigId: true } } },
    }) : null,
  ]);
  const allowed = deepseekNewsSearchAllowed();
  const personalKey = allowed && personal && (personal.role === 'super_admin' || hasActivePro(personal))
    ? personal.settings?.deepseekApiKeyEncrypted : null;
  const homepageKey = allowed && user ? app.newsSearchDeepseekKeyEncrypted : null;
  let modelKey: string | null = null;
  if (allowed && personal?.role === 'super_admin' && !decryptSecret(personalKey) && !decryptSecret(homepageKey)) {
    const models = await prisma.platformModelConfig.findMany({
      where: { archivedAt: null, isEnabled: true, deepseekApiKeyEncrypted: { not: null } },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, deepseekApiKeyEncrypted: true },
    });
    const preferred = models.find(model => model.id === personal.settings?.defaultPlatformModelConfigId);
    modelKey = (decryptSecret(preferred?.deepseekApiKeyEncrypted) ? preferred : models.find(model => decryptSecret(model.deepseekApiKeyEncrypted)))
      ?.deepseekApiKeyEncrypted ?? null;
  }
  const source = decryptSecret(personalKey) ? 'personal' : decryptSecret(homepageKey) || modelKey ? 'platform' : null;
  const encryptedKey = source === 'personal' ? personalKey : source === 'platform' ? modelKey || homepageKey : null;
  const unavailableReason = !allowed ? 'deployment_disabled' : !user ? 'sign_in_required' : source ? null
    : personalKey || homepageKey ? 'credential_unreadable' : 'missing_credential';
  const capabilities: NewsCapabilities = {
    paidAllowed: allowed, deepseekAvailable: Boolean(encryptedKey), deepseekSource: source, unavailableReason,
    defaultProvider: app.newsSearchProvider === 'deepseek' && encryptedKey && !modelKey ? 'deepseek' : 'free',
  };
  return { capabilities, encryptedKey, aiModelConfigId: app.newsSearchAiModelConfigId, scope: source === 'personal' ? `personal:${user!.id}` : 'platform', dailyLimit: app.newsSearchDailyLimit ?? 200 };
}

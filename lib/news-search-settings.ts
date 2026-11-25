import { decryptSecret } from './secret';
import { prisma } from './prisma';
import { getOrCreateAppSetting, hasActivePro } from './billing';
import { paidSearchAllowed } from './web-search-policy';
import type { NewsCapabilities } from './news-search-types';
import type { CurrentUser } from './auth';

export async function resolveNewsSearchAccess(user: CurrentUser | null) {
  const [app, personal] = await Promise.all([
    getOrCreateAppSetting(),
    user ? prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, planType: true, proAccessExpiresAt: true, settings: { select: { deepseekApiKeyEncrypted: true } } },
    }) : null,
  ]);
  const allowed = paidSearchAllowed();
  const personalKey = allowed && personal && (personal.role === 'super_admin' || hasActivePro(personal))
    ? personal.settings?.deepseekApiKeyEncrypted : null;
  const platformKey = allowed && user ? app.newsSearchDeepseekKeyEncrypted : null;
  const source = decryptSecret(personalKey) ? 'personal' : decryptSecret(platformKey) ? 'platform' : null;
  const encryptedKey = source === 'personal' ? personalKey : source === 'platform' ? platformKey : null;
  const unavailableReason = !allowed ? 'deployment_disabled' : !user ? 'sign_in_required' : source ? null
    : personalKey || platformKey ? 'credential_unreadable' : 'missing_credential';
  const capabilities: NewsCapabilities = {
    paidAllowed: allowed, deepseekAvailable: Boolean(encryptedKey), deepseekSource: source, unavailableReason,
    defaultProvider: app.newsSearchProvider === 'deepseek' && encryptedKey ? 'deepseek' : 'free',
  };
  return { capabilities, encryptedKey, aiModelConfigId: app.newsSearchAiModelConfigId, scope: source === 'personal' ? `personal:${user!.id}` : 'platform', dailyLimit: app.newsSearchDailyLimit ?? 200 };
}

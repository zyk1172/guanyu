import { prisma } from './prisma';
import { decryptSecret } from './secret';
import type { PlatformModelSnapshot } from './platform-models';
import type { WebSearchOptions } from './search';
import type { ReportLanguage } from './types';
import { paidSearchAllowed } from './web-search-policy';

export function personalDeepseekSearchOptions(settings: { searchProvider?: string; deepseekApiKeyEncrypted?: string | null } | null | undefined, locale?: ReportLanguage): WebSearchOptions | null {
  if (!paidSearchAllowed() || settings?.searchProvider !== 'deepseek') return null;
  return { provider: 'deepseek', deepseekApiKey: decryptSecret(settings.deepseekApiKeyEncrypted), locale };
}

export async function platformDeepseekSearchOptions(snapshot: PlatformModelSnapshot, locale?: ReportLanguage): Promise<WebSearchOptions | null> {
  if (!paidSearchAllowed() || snapshot.searchProvider !== 'deepseek') return null;
  const current = await prisma.platformModelConfig.findUnique({ where: { id: snapshot.configId }, select: { deepseekApiKeyEncrypted: true } });
  return { provider: 'deepseek', deepseekApiKey: decryptSecret(current?.deepseekApiKeyEncrypted), locale };
}

import crypto from 'node:crypto';
import { prisma } from './prisma';
import { privacyHmacHash } from './privacy-hash';
import { decryptSecret } from './secret';
import { AccessError, reserveAccessAttempt } from './access';
import { searchFreeWeb, FreeSearchError, type FreeSearchOptions } from './free-web-search';
import { searchDeepseek } from './deepseek-search';
import { normalizeNewsArticles, newsUrl } from './news-search-core';
import { recordModelUsage } from './model-usage';
import { shanghaiDate } from './traffic-core';
import type { NewsSearchResult, NewsProvider, NewsPeriod } from './news-search-types';
import type { resolveNewsSearchAccess } from './news-search-settings';
import type { ReportLanguage } from './types';
import type { WebSearchSource } from './search';

type Access = Awaited<ReturnType<typeof resolveNewsSearchAccess>>;
export type NewsSearchInput = { query: string; provider: NewsProvider; period: NewsPeriod; language: ReportLanguage };

export async function runNewsSearch(input: NewsSearchInput, access: Access, userId: string | null, test?: { freeOptions?: FreeSearchOptions; deepseekFetch?: typeof fetch }) {
  const paid = input.provider === 'deepseek';
  if (paid && (!userId || !access.capabilities.deepseekAvailable || !access.encryptedKey)) throw new AccessError('DeepSeek 搜索暂不可用，请选择免费新闻搜索或检查搜索设置。', 403);
  if (paid && input.period !== 'any') throw new AccessError('当前 DeepSeek 搜索不支持可靠的时间筛选，请选择不限时间。');
  const credentialScope = paid ? `${access.scope}:${privacyHmacHash(access.encryptedKey!)}` : 'public';
  const cacheKey = privacyHmacHash(JSON.stringify(['news-v2', credentialScope, input.provider, input.period, input.language, input.query]));
  const claim = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`news:${cacheKey}`}))`;
    const current = await tx.newsSearchCache.findUnique({ where: { cacheKey } });
    const now = new Date();
    if (current?.status === 'COMPLETED' && current.expiresAt > now && current.resultJson) return { cached: current.resultJson, id: '' };
    if (current?.status === 'RUNNING' && current.leaseUntil > now) throw new AccessError('相同搜索正在处理，请稍候重试。', 409);
    if (current) await tx.newsSearchCache.delete({ where: { id: current.id } });
    const row = await tx.newsSearchCache.create({ data: { id: crypto.randomUUID(), cacheKey, status: 'RUNNING', leaseUntil: new Date(Date.now() + 30_000), expiresAt: new Date(Date.now() + 180_000) } });
    return { cached: null, id: row.id };
  });
  if (claim.cached) return { ...JSON.parse(claim.cached), cached: true } as NewsSearchResult;
  const counts: Record<string, number> = {};
  const onRequest = (provider: string) => { counts[provider] = (counts[provider] || 0) + 1; };
  const started = Date.now();
  let succeeded = false;
  try {
    // DeepSeek is a general web index. Check its candidates against a news index
    // before presenting them as reports, and avoid a paid call when none exist.
    let newsIndex: WebSearchSource[] | undefined;
    if (paid) {
      newsIndex = (await searchFreeWeb(input.query, 10, { ...test?.freeOptions, category: 'news', locale: input.language, onRequest })).sources;
    }
    if (paid && newsIndex?.length) {
      await reserveAccessAttempt('news-paid-user', userId!, 10, 10 * 60_000);
      if (access.capabilities.deepseekSource === 'platform') {
        try { await reserveAccessAttempt('news-paid-platform-day', `${access.scope}:${shanghaiDate()}`, access.dailyLimit, 24 * 3600_000); }
        catch (error) { if (error instanceof AccessError && error.status === 429) throw new AccessError('今日平台 DeepSeek 搜索额度已用完，可改用免费网页搜索。', 429); throw error; }
      }
    }
    let sources: WebSearchSource[];
    if (paid) {
      const indexed = new Map((newsIndex || []).flatMap(source => {
        const url = newsUrl(source.url);
        return url ? [[url.replace(/\/$/, ''), source] as const] : [];
      }));
      const newsQuery = `${input.language.startsWith('zh') ? '新闻报道' : 'news report'} ${input.query}`;
      const candidates = indexed.size ? await searchDeepseek(newsQuery, 20, { apiKey: decryptSecret(access.encryptedKey), onRequest, fetch: test?.deepseekFetch }) : [];
      sources = candidates.flatMap(candidate => {
        const url = newsUrl(candidate.url);
        const confirmed = url && indexed.get(url.replace(/\/$/, ''));
        return confirmed ? [{ ...confirmed, provider: 'deepseek' }] : [];
      });
    }
    else {
      try {
        sources = (await searchFreeWeb(input.query, 10, { ...test?.freeOptions, category: 'news', ...(input.period !== 'any' ? { timeRange: input.period } : {}), locale: input.language, onRequest })).sources;
      } catch (error) {
        if (error instanceof FreeSearchError && error.attempts.length && error.attempts.every(item => item.outcome === 'empty')) sources = [];
        else throw error;
      }
    }
    const articles = normalizeNewsArticles(sources);
    const providers = [...new Set(sources.map(item => item.provider || 'web'))];
    const result: NewsSearchResult = { articles, providers, requestedProvider: input.provider, searchedAt: new Date().toISOString(), cached: false, timeFilterApplied: input.period !== 'any', webFallback: false };
    await prisma.newsSearchCache.updateMany({ where: { id: claim.id, status: 'RUNNING' }, data: { status: 'COMPLETED', resultJson: JSON.stringify(result), expiresAt: new Date(Date.now() + (articles.length ? 180_000 : 30_000)) } });
    succeeded = true;
    return result;
  } catch (error) {
    await prisma.newsSearchCache.deleteMany({ where: { id: claim.id } });
    if (error instanceof AccessError) throw error;
    throw new AccessError(paid ? '新闻来源或 DeepSeek 暂时不可用，可以改用免费新闻搜索。' : '新闻搜索暂时不可用，请稍后重试或使用网页链接／粘贴正文。', 503);
  } finally {
    if (Object.keys(counts).length) await recordModelUsage({ userId, operation: 'news_search', source: paid && access.capabilities.deepseekSource === 'personal' ? 'custom' : 'platform', status: succeeded ? 'success' : 'failed', externalSearchCounts: counts, durationMs: Date.now() - started }).catch(() => { console.error('[news-search-usage] failed to record usage'); });
  }
}

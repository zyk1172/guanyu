import crypto from 'node:crypto';
import { prisma } from './prisma';
import { privacyHmacHash } from './privacy-hash';
import { decryptSecret } from './secret';
import { AccessError, reserveAccessAttempt } from './access';
import { searchFreeWeb, FreeSearchError, type FreeSearchOptions } from './free-web-search';
import { searchDeepseek } from './deepseek-search';
import { normalizeNewsArticles, newsUrl } from './news-search-core';
import { recordModelUsage } from './model-usage';
import { platformModelSnapshot, resolvePlatformModel } from './platform-models';
import { applyNewsRanking, newsQueryVariants, planNewsSearch, rankNewsSearch } from './news-search-model';
import { addResearchUsage } from './event-search';
import type { invokeModel, RuntimeUsage } from './model-runtime';
import { shanghaiDate } from './traffic-core';
import type { NewsSearchResult, NewsProvider, NewsPeriod } from './news-search-types';
import type { resolveNewsSearchAccess } from './news-search-settings';
import type { ReportLanguage } from './types';
import type { WebSearchSource } from './search';

type Access = Awaited<ReturnType<typeof resolveNewsSearchAccess>>;
export type NewsSearchInput = { query: string; provider: NewsProvider; period: NewsPeriod; language: ReportLanguage };

export async function runNewsSearch(input: NewsSearchInput, access: Access, userId: string | null, test?: { freeOptions?: FreeSearchOptions; deepseekFetch?: typeof fetch; modelInvoke?: typeof invokeModel }) {
  const paid = input.provider === 'deepseek';
  if (paid && (!userId || !access.capabilities.deepseekAvailable || !access.encryptedKey)) throw new AccessError('DeepSeek 搜索暂不可用，请选择免费新闻搜索或检查搜索设置。', 403);
  if (paid && input.period !== 'any') throw new AccessError('当前 DeepSeek 搜索不支持可靠的时间筛选，请选择不限时间。');
  const credentialScope = paid ? `${access.scope}:${privacyHmacHash(access.encryptedKey!)}` : 'public';
  const cacheKey = privacyHmacHash(JSON.stringify(['news-v3', credentialScope, input.provider, input.period, input.language, input.query]));
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
  let aiUsage: RuntimeUsage | undefined;
  let aiSnapshot: ReturnType<typeof platformModelSnapshot> | undefined;
  let aiUsed = false;
  try {
    const indexDeadline = started + (paid ? 17_000 : 20_000);
    const searchIndex = async (query: string) => {
      try {
        return (await searchFreeWeb(query, 10, {
          ...test?.freeOptions, category: 'news', locale: input.language, onRequest, deadline: indexDeadline,
          ...(input.period !== 'any' ? { timeRange: input.period } : {}),
        })).sources;
      } catch (error) {
        if (error instanceof FreeSearchError && error.attempts.length && error.attempts.every(item => item.outcome === 'empty')) return [];
        throw error;
      }
    };
    const originalSearch = Promise.allSettled([searchIndex(input.query)]);
    const configuredLimit = Number(process.env.NEWS_SEARCH_AI_DAILY_LIMIT || '200');
    const model = (!test || test.modelInvoke) && configuredLimit > 0 && !/[<>@]|https?:|www\.|\b\d{9,}\b/i.test(input.query)
      ? await (async () => {
        try {
          const config = await resolvePlatformModel({ operation: 'analysis', userDefaultId: access.aiModelConfigId });
          const snapshot = platformModelSnapshot(config);
          const apiKey = decryptSecret(config.apiKeyEncrypted);
          if (!apiKey && !test?.modelInvoke) return null;
          await reserveAccessAttempt('news-ai-platform-day', shanghaiDate(), Math.min(10_000, Math.floor(configuredLimit)), 24 * 3600_000);
          const baseUrl = snapshot.baseUrl;
          return { snapshot, config: {
            baseUrl, apiKey, provider: snapshot.provider, modelId: snapshot.modelId,
            allowPrivateAddress: process.env.ALLOW_PRIVATE_ADMIN_LLM === 'true'
              && Boolean(process.env.OPENAI_BASE_URL)
              && baseUrl.replace(/\/$/, '') === process.env.OPENAI_BASE_URL!.replace(/\/$/, ''),
          } };
        } catch { return null; }
      })() : null;

    let searchTerms: string[] = [];
    if (model && Date.now() < started + 5_000) {
      const plan = await planNewsSearch(model.config, input.query, input.language, started + 5_000 - Date.now(), test?.modelInvoke);
      aiUsage = plan.usage;
      aiSnapshot = model.snapshot;
      if (plan.ok) searchTerms = newsQueryVariants(plan.message, input.query);
    }
    const variantsSearch = Promise.allSettled(searchTerms.map(searchIndex));
    const groups = [...await originalSearch, ...await variantsSearch];
    if (groups.every(item => item.status === 'rejected')) throw new Error('news_index_unavailable');
    const rankedGroups = groups.flatMap(item => item.status === 'fulfilled' ? [item.value] : []);
    // Interleave matches from the original query and each variant so a full
    // page of original hits does not crowd out the expanded searches.
    const indexedSources = Array.from({ length: 10 }, (_, i) => rankedGroups.flatMap(group => group[i] ? [group[i]] : [])).flat();
    let sources: WebSearchSource[] = indexedSources;
    if (paid && indexedSources.length) {
      await reserveAccessAttempt('news-paid-user', userId!, 10, 10 * 60_000);
      if (access.capabilities.deepseekSource === 'platform') {
        try { await reserveAccessAttempt('news-paid-platform-day', `${access.scope}:${shanghaiDate()}`, access.dailyLimit, 24 * 3600_000); }
        catch (error) { if (error instanceof AccessError && error.status === 429) throw new AccessError('今日平台 DeepSeek 搜索额度已用完，可改用免费网页搜索。', 429); throw error; }
      }
      const indexed = new Map(indexedSources.flatMap(source => {
        const url = newsUrl(source.url);
        return url ? [[url.replace(/\/$/, ''), source] as const] : [];
      }));
      const queries = [input.query, ...searchTerms];
      const bestIndex = groups.reduce((best, group, i) => {
        const previous = groups[best];
        return group.status === 'fulfilled' && group.value.length > (previous.status === 'fulfilled' ? previous.value.length : 0) ? i : best;
      }, 0);
      const newsQuery = `${input.language.startsWith('zh') ? '新闻报道' : 'news report'} ${queries[bestIndex]}`;
      const candidates = await searchDeepseek(newsQuery, 20, {
        apiKey: decryptSecret(access.encryptedKey), onRequest, fetch: test?.deepseekFetch,
        timeoutMs: Math.max(1, Math.min(7_000, started + 25_000 - Date.now())),
      });
      sources = candidates.flatMap(candidate => {
        const url = newsUrl(candidate.url);
        const confirmed = url && indexed.get(url.replace(/\/$/, ''));
        return confirmed ? [{ ...confirmed, provider: 'deepseek' }] : [];
      });
    }
    let articles = normalizeNewsArticles(sources, 16);
    let aiRanked = false;
    const rankBudget = Math.min(4_000, started + 28_000 - Date.now());
    if (model && articles.length > 1 && rankBudget > 200) {
      const ranking = await rankNewsSearch(model.config, input.query, articles, rankBudget, test?.modelInvoke);
      aiSnapshot = model.snapshot;
      aiUsage = addResearchUsage(aiUsage, ranking.usage);
      const ranked = ranking.ok ? applyNewsRanking(ranking.message, articles) : null;
      if (ranked) { articles = ranked; aiRanked = true; }
    }
    searchTerms = searchTerms.filter((_term, i) => groups[i + 1]?.status === 'fulfilled');
    aiUsed = searchTerms.length > 0 || aiRanked;
    articles = articles.slice(0, 10);
    const providers = [...new Set(articles.map(item => item.provider))];
    const result: NewsSearchResult = { articles, providers, requestedProvider: input.provider, searchedAt: new Date().toISOString(), cached: false, timeFilterApplied: input.period !== 'any', webFallback: false, searchTerms, aiRanked };
    await prisma.newsSearchCache.updateMany({ where: { id: claim.id, status: 'RUNNING' }, data: { status: 'COMPLETED', resultJson: JSON.stringify(result), expiresAt: new Date(Date.now() + (articles.length ? 180_000 : 30_000)) } });
    succeeded = true;
    return result;
  } catch (error) {
    await prisma.newsSearchCache.deleteMany({ where: { id: claim.id } });
    if (error instanceof AccessError) throw error;
    throw new AccessError(paid ? '新闻来源或 DeepSeek 暂时不可用，可以改用免费新闻搜索。' : '新闻搜索暂时不可用，请稍后重试或使用网页链接／粘贴正文。', 503);
  } finally {
    if (aiSnapshot) await recordModelUsage({
      userId, operation: 'news_search_ai', source: 'platform', status: succeeded && aiUsed ? 'success' : 'failed',
      snapshot: aiSnapshot, usage: aiUsage, durationMs: Date.now() - started,
    }).catch(() => console.error('[news-search-usage] failed to record model usage'));
    if (Object.keys(counts).length) await recordModelUsage({ userId, operation: 'news_search', source: paid && access.capabilities.deepseekSource === 'personal' ? 'custom' : 'platform', status: succeeded ? 'success' : 'failed', externalSearchCounts: counts, durationMs: Date.now() - started }).catch(() => { console.error('[news-search-usage] failed to record usage'); });
  }
}

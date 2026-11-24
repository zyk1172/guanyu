import crypto from 'node:crypto';
import { prisma } from './prisma';
import { privacyHmacHash } from './privacy-hash';
import { decryptSecret } from './secret';
import { AccessError, reserveAccessAttempt, reserveAccessAttempts } from './access';
import { searchFreeWeb, FreeSearchError, type FreeSearchOptions } from './free-web-search';
import { searchDeepseek } from './deepseek-search';
import { normalizeNewsArticles } from './news-search-core';
import { recordModelUsage } from './model-usage';
import { platformModelSnapshot } from './platform-models';
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
  const cacheKey = privacyHmacHash(JSON.stringify(['news-v4', credentialScope, input.provider, input.period, input.language, input.query, access.aiModelConfigId || null]));
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
    let sources: WebSearchSource[];
    let searchTerms: string[] = [];
    let model: Awaited<ReturnType<typeof newsSearchModel>> = null;
    const configuredLimit = Math.min(10_000, Math.floor(Number(process.env.NEWS_SEARCH_AI_DAILY_LIMIT || '200')));
    if (paid) {
      const apiKey = decryptSecret(access.encryptedKey);
      if (!apiKey) throw new AccessError('DeepSeek 搜索密钥不可用。', 403);
      await reserveAccessAttempts([
        { scope: 'news-paid-user', key: userId!, limit: 10, windowMs: 10 * 60_000 },
        ...(access.capabilities.deepseekSource === 'platform' ? [{
          scope: 'news-paid-platform-day',
          key: shanghaiDate(),
          limit: access.dailyLimit,
          windowMs: 24 * 3600_000,
          exhaustedMessage: '今日平台 DeepSeek 搜索额度已用完，可改用免费网页搜索。',
        }] : []),
      ]);
      const prefix = input.language.startsWith('zh') ? '新闻报道' : 'news report';
      sources = await searchDeepseek(`${prefix} ${input.query}`, 20, {
        apiKey, onRequest, fetch: test?.deepseekFetch, timeoutMs: 10_000,
      });
    } else {
      const searchIndex = async (query: string) => {
        try {
          return (await searchFreeWeb(query, 10, {
            ...test?.freeOptions, category: 'news', locale: input.language, onRequest, deadline: started + 20_000,
            ...(input.period !== 'any' ? { timeRange: input.period } : {}),
          })).sources;
        } catch (error) {
          if (error instanceof FreeSearchError && error.attempts.length && error.attempts.every(item => item.outcome === 'empty')) return [];
          throw error;
        }
      };
      const originalSearch = Promise.allSettled([searchIndex(input.query)]);
      if (userId && access.capabilities.paidAllowed && access.aiModelConfigId && configuredLimit > 0
        && !/[<>@]|https?:|www\.|\b\d{9,}\b/i.test(input.query)) {
        model = await newsSearchModel(access.aiModelConfigId);
      }

      if (model && Date.now() < started + 5_000 && await reserveAiSearch(configuredLimit)) {
        const budget = started + 5_000 - Date.now();
        if (budget > 0) {
          const plan = await planNewsSearch(model.config, input.query, input.language, budget, test?.modelInvoke);
          aiUsage = plan.usage;
          aiSnapshot = model.snapshot;
          if (plan.ok) searchTerms = newsQueryVariants(plan.message, input.query);
        }
      }
      const groups = [...await originalSearch, ...await Promise.allSettled(searchTerms.map(searchIndex))];
      if (groups.every(item => item.status === 'rejected')) throw new Error('news_index_unavailable');
      const rankedGroups = groups.flatMap(item => item.status === 'fulfilled' ? [item.value] : []);
      sources = Array.from({ length: 10 }, (_, i) => rankedGroups.flatMap(group => group[i] ? [group[i]] : [])).flat();
      searchTerms = searchTerms.filter((_term, i) => groups[i + 1]?.status === 'fulfilled');
    }
    let articles = normalizeNewsArticles(sources, 16);
    let aiRanked = false;
    const rankBudget = Math.min(4_000, started + 28_000 - Date.now());
    if (model && articles.length > 1 && rankBudget > 200 && await reserveAiSearch(configuredLimit)) {
      const ranking = await rankNewsSearch(model.config, input.query, articles, rankBudget, test?.modelInvoke);
      aiSnapshot = model.snapshot;
      aiUsage = addResearchUsage(aiUsage, ranking.usage);
      const ranked = ranking.ok ? applyNewsRanking(ranking.message, articles) : null;
      if (ranked) { articles = ranked; aiRanked = true; }
    }
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


async function newsSearchModel(id: string) {
  const config = await prisma.platformModelConfig.findFirst({
    where: { id, archivedAt: null, isEnabled: true, supportsAnalysis: true },
  });
  if (!config) return null;
  const apiKey = decryptSecret(config.apiKeyEncrypted);
  if (!apiKey) return null;
  const snapshot = platformModelSnapshot(config);
  return { snapshot, config: {
    baseUrl: snapshot.baseUrl, apiKey, provider: snapshot.provider, modelId: snapshot.modelId,
    allowPrivateAddress: process.env.ALLOW_PRIVATE_ADMIN_LLM === 'true'
      && snapshot.baseUrl === process.env.OPENAI_BASE_URL?.replace(/\/$/, ''),
  } };
}

async function reserveAiSearch(limit: number) {
  try {
    await reserveAccessAttempt('news-ai-platform-day', shanghaiDate(), limit, 24 * 3600_000);
    return true;
  } catch {
    return false;
  }
}

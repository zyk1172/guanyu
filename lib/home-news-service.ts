import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { privacyHmacHash } from './privacy-hash';
import { fetchFeedXml, getCachedFeedXml, loadRssSources, type RssSource } from './rss-service';
import { parseHeadlineIndex, publisherKey, rankHomeNews } from './home-news-core';
import { newsImageHref } from './news-media';
import type { RssHeadline } from './rss-core.mjs';
import { HOME_NEWS_REFRESH_MS, HOME_NEWS_RETENTION_MS, type HomeHeadline, type HomeNewsPayload, type NewsHeadlineIndex } from './home-news-types';

export type Snapshot = { headlines: HomeHeadline[]; index: NewsHeadlineIndex[]; sourceErrors: HomeNewsPayload['sourceErrors']; fetchedAt: string; indexAvailable: boolean };
const RETRY_DELAY_MS = 2 * 60_000;
export class FeedRefreshingError extends Error {}

function newsEdition(language: string) {
  return language === 'zh-TW' ? 'zh-TW' : language.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function homeNewsCacheKey(sources: RssSource[], language: string) {
  return privacyHmacHash(JSON.stringify(['home-rss-v1', newsEdition(language), sources.map(source => [source.id,source.name,source.nameZh,source.feedUrl,source.websiteUrl])]));
}
export function homeNewsPayload(snapshot: Snapshot, sources: RssSource[], language: string, stale = false): HomeNewsPayload {
  // Custom source IDs contain the feed URL. Use opaque IDs in browser snapshots.
  const customIds = new Map(sources.filter(source => source.region === 'custom').map(source => [
    source.id, privacyHmacHash(source.id),
  ]));
  const headlines = snapshot.headlines.map(headline => {
    const sourceId = customIds.get(headline.sourceId);
    return sourceId ? { ...headline, id: `${sourceId}:${headline.url}`, sourceId } : headline;
  });
  const stories = rankHomeNews(headlines, snapshot.index, { language }).map(story => {
    const reports=story.reports.map(report=>({...report,publishedAt:Number.isFinite(Date.parse(report.publishedAt))&&Date.parse(report.publishedAt)<=Date.now()+300000?report.publishedAt:'',imageHref:newsImageHref(report.url,report.imageUrl)}));
    const headline=reports.find(report=>report.id===story.headline.id)||{...story.headline,imageHref:newsImageHref(story.headline.url,story.headline.imageUrl)};
    return {...story,headline,reports,imageHref:headline.imageHref};
  });
  return {
    sources: sources.map(({ id, name, nameZh }) => ({ id: customIds.get(id) ?? id, name, nameZh })),
    stories,
    hotCount: stories.filter(story => story.isHot).length,
    fetchedAt: snapshot.fetchedAt,
    sourceErrors: snapshot.sourceErrors.map(error => ({ ...error, sourceId: customIds.get(error.sourceId) ?? error.sourceId })),
    indexAvailable: snapshot.indexAvailable,
    ...(stale ? { stale: true } : {}),
  };
}
export async function loadHomeSnapshot(sources: RssSource[], language: string, options?: {
  readFeed?: typeof fetchFeedXml;
  feeds?: () => Promise<{headlines:RssHeadline[];sourceErrors:Snapshot['sourceErrors'];fetchedAt:string}>;
  index?: () => Promise<string|string[]>;
}): Promise<Snapshot> {
  const feedEdition = newsEdition(language);
  const englishIndex = 'hl=en-US&gl=US&ceid=US:en';
  const indexes = feedEdition === 'en-US' ? [englishIndex] : [
    feedEdition === 'zh-TW' ? 'hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    englishIndex,
  ];
  const readFeed = options?.readFeed ?? getCachedFeedXml;
  const [feeds,indexed] = await Promise.allSettled([
    options?.feeds ? options.feeds() : loadRssSources(sources, readFeed),
    options?.index ? options.index() : Promise.allSettled(indexes.map(edition => readFeed(`https://news.google.com/rss?${edition}`))).then(results => results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])),
  ]);
  if (feeds.status !== 'fulfilled' || !feeds.value.headlines.length) throw new Error('RSS 新闻暂时无法读取，请稍后刷新。');
  const ranks = new Map<string,number>();
  const headlines = feeds.value.headlines.flatMap(item => {
    const source = sources.find(source=>source.id===item.sourceId);if (!source) return [];
    const feedRank = ranks.get(source.id) || 0;ranks.set(source.id,feedRank+1);
    // Count the article publisher, including when a custom feed is hosted by
    // an aggregator or a feed proxy rather than by the publisher itself.
    return [{...item,feedRank,publisher:publisherKey(item.url)}];
  });
  const populated = new Set(headlines.map(item => item.sourceId));
  const errors = new Map(feeds.value.sourceErrors.map(error => [error.sourceId, error]));
  for (const source of sources) {
    if (!populated.has(source.id) && !errors.has(source.id)) {
      errors.set(source.id, { sourceId: source.id, message: 'RSS 源暂时没有可读取的标题。' });
    }
  }
  const index = indexed.status === 'fulfilled' ? (Array.isArray(indexed.value)?indexed.value:[indexed.value]).flatMap(parseHeadlineIndex) : [];
  return { headlines, index, sourceErrors: [...errors.values()], fetchedAt: feeds.value.fetchedAt, indexAvailable: index.length > 0 };
}

function retainedSnapshot(row: { resultJson: string | null; status: string } | null) {
  if (!row?.resultJson || row.status !== 'COMPLETED') return null;
  try {
    const data = JSON.parse(row.resultJson) as Snapshot;
    const age = Date.now() - Date.parse(data.fetchedAt);
    if (Number.isFinite(age) && age >= 0 && age < HOME_NEWS_RETENTION_MS) {
      return { data, stale: Math.floor(Date.parse(data.fetchedAt) / HOME_NEWS_REFRESH_MS) < Math.floor(Date.now() / HOME_NEWS_REFRESH_MS) };
    }
  } catch { /* Refresh malformed snapshots. */ }
  return null;
}

function keepUnavailableSources(snapshot: Snapshot, previous?: Snapshot): Snapshot {
  if (!previous) return snapshot;
  const unavailable = new Set(snapshot.sourceErrors.map(error => error.sourceId));
  return {
    ...snapshot,
    headlines: [...snapshot.headlines, ...previous.headlines.filter(item => unavailable.has(item.sourceId))],
  };
}

export async function readHomeSnapshot(key: string) {
  return retainedSnapshot(await prisma.newsSearchCache.findUnique({ where: { cacheKey: key } }));
}

export async function loadLocalHomeSnapshot(sources: RssSource[], language: string, previous?: Snapshot) {
  const snapshot = await loadHomeSnapshot(sources, language, { readFeed: fetchFeedXml });
  return keepUnavailableSources(snapshot, previous);
}

export async function refreshHomeSnapshot(key: string, sources: RssSource[], language: string, load = loadHomeSnapshot) {
  const claim = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`home-news:${key}`}))`;
    const current = await tx.newsSearchCache.findUnique({ where: { cacheKey: key } });
    const previous = retainedSnapshot(current);
    if (previous && !previous.stale) return { data: previous.data };
    if (current && current.leaseUntil.getTime() > Date.now()) return null;

    const now = Date.now();
    const data = {
      leaseUntil: new Date(now + 30_000),
      expiresAt: new Date(Math.max(current?.expiresAt.getTime() ?? 0, now + RETRY_DELAY_MS + 30_000)),
    };
    const lease = await tx.newsSearchCache.upsert({
      where: { cacheKey: key },
      create: { id: randomUUID(), cacheKey: key, status: 'RUNNING', ...data },
      update: data,
    });
    return { lease, previous: previous?.data };
  });
  if (!claim) throw new FeedRefreshingError('正在同步新闻，请稍候。');
  if (claim.data) return claim.data;

  const { lease, previous } = claim;
  const where = { id: lease.id, leaseUntil: lease.leaseUntil };
  try {
    const snapshot = keepUnavailableSources(await load(sources, language), previous);
    const updated = await prisma.newsSearchCache.updateMany({
      where,
      data: {
        status: 'COMPLETED',
        resultJson: JSON.stringify(snapshot),
        expiresAt: new Date(Date.now() + HOME_NEWS_RETENTION_MS),
        leaseUntil: new Date(0),
      },
    });
    if (updated.count) return snapshot;
    const published = await readHomeSnapshot(key);
    if (published) return published.data;
    throw new FeedRefreshingError('正在同步新闻，请稍候。');
  } catch (error) {
    await prisma.newsSearchCache.updateMany({ where, data: { leaseUntil: new Date(Date.now() + RETRY_DELAY_MS) } });
    throw error;
  }
}

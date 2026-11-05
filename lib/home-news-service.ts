import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { privacyHmacHash } from './privacy-hash';
import { getCachedFeedXml, loadRssSources, type RssSource } from './rss-service';
import { parseHeadlineIndex, publisherKey, rankHomeNews } from './home-news-core';
import { newsImageHref } from './news-media';
import type { RssHeadline } from './rss-core.mjs';
import type { HomeHeadline, HomeNewsPayload, NewsHeadlineIndex } from './home-news-types';

export type Snapshot = { headlines: HomeHeadline[]; index: NewsHeadlineIndex[]; sourceErrors: HomeNewsPayload['sourceErrors']; fetchedAt: string; indexAvailable: boolean };
const TTL = 2 * 60_000;
const MAX_SNAPSHOT_AGE = 3600_000;
export class FeedRefreshingError extends Error {}
export function homeNewsCacheKey(sources: RssSource[], language: string) {
  return privacyHmacHash(JSON.stringify(['home-rss-v1', language, sources.map(source => [source.id,source.name,source.nameZh,source.feedUrl,source.websiteUrl])]));
}
export function homeNewsPayload(snapshot: Snapshot, sources: RssSource[], language: string, stale = false): HomeNewsPayload {
  const stories = rankHomeNews(snapshot.headlines, snapshot.index, { language }).map(story => {
    const reports=story.reports.map(report=>({...report,publishedAt:Number.isFinite(Date.parse(report.publishedAt))&&Date.parse(report.publishedAt)<=Date.now()+300000?report.publishedAt:'',imageHref:newsImageHref(report.url,report.imageUrl)}));
    const headline=reports.find(report=>report.id===story.headline.id)||{...story.headline,imageHref:newsImageHref(story.headline.url,story.headline.imageUrl)};
    return {...story,headline,reports,imageHref:headline.imageHref};
  });
  return { sources: sources.map(({id,name,nameZh})=>({id,name,nameZh})), stories, hotCount: stories.filter(story=>story.isHot).length, fetchedAt: snapshot.fetchedAt, sourceErrors: snapshot.sourceErrors, indexAvailable: snapshot.indexAvailable, ...(stale ? {stale:true} : {}) };
}
export async function loadHomeSnapshot(sources: RssSource[], language: string, test?: { feeds?: () => Promise<{headlines:RssHeadline[];sourceErrors:Snapshot['sourceErrors'];fetchedAt:string}>; index?: () => Promise<string|string[]> }): Promise<Snapshot> {
  const edition = language === 'zh-TW' ? 'hl=zh-TW&gl=TW&ceid=TW:zh-Hant' : language.startsWith('zh') ? 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans' : 'hl=en-US&gl=US&ceid=US:en';
  const [feeds,indexed] = await Promise.allSettled([
    test?.feeds ? test.feeds() : loadRssSources(sources),
    test?.index ? test.index() : Promise.allSettled((language.startsWith('zh')?[edition,'hl=en-US&gl=US&ceid=US:en']:[edition]).map(edition=>getCachedFeedXml(`https://news.google.com/rss?${edition}`))).then(results=>results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])),
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
  const index = indexed.status === 'fulfilled' ? (Array.isArray(indexed.value)?indexed.value:[indexed.value]).flatMap(parseHeadlineIndex) : [];
  return {headlines,index,sourceErrors:feeds.value.sourceErrors,fetchedAt:feeds.value.fetchedAt,indexAvailable:index.length>0};
}
export async function readHomeSnapshot(key: string) {
  const row = await prisma.newsSearchCache.findUnique({where:{cacheKey:key}});
  if (row?.resultJson && row.status === 'COMPLETED') {
    try {
      const data=JSON.parse(row.resultJson) as Snapshot;
      const age=Date.now()-Date.parse(data.fetchedAt);
      if (Number.isFinite(age) && age>=0 && age<MAX_SNAPSHOT_AGE) return { data, stale:age>=TTL || row.expiresAt.getTime()<=Date.now() };
    } catch { /* Refresh malformed snapshots. */ }
  }
  return null;
}
export async function refreshHomeSnapshot(key: string, sources: RssSource[], language: string, load = loadHomeSnapshot) {
  const lease = await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`home-news:${key}`}))`;
    const current=await tx.newsSearchCache.findUnique({where:{cacheKey:key}});
    if(current && current.leaseUntil.getTime()>Date.now()) return null;
    const data={leaseUntil:new Date(Date.now()+30000),expiresAt:current?.expiresAt || new Date(Date.now()+MAX_SNAPSHOT_AGE)};
    return tx.newsSearchCache.upsert({where:{cacheKey:key},create:{id:randomUUID(),cacheKey:key,status:'RUNNING',...data},update:data});
  });
  if(!lease) throw new FeedRefreshingError('正在同步新闻，请稍候。');
  try {
    const snapshot=await load(sources,language);
    // Retain the last successful snapshot through the soft refresh window;
    // privacy cleanup must not delete it after only two minutes.
    await prisma.newsSearchCache.updateMany({where:{id:lease.id,leaseUntil:lease.leaseUntil},data:{status:'COMPLETED',resultJson:JSON.stringify(snapshot),expiresAt:new Date(Date.now()+MAX_SNAPSHOT_AGE),leaseUntil:new Date(0)}});
    return snapshot;
  } catch(error) {
    if(lease.resultJson) await prisma.newsSearchCache.updateMany({where:{id:lease.id,leaseUntil:lease.leaseUntil},data:{leaseUntil:new Date(0)}});
    else await prisma.newsSearchCache.deleteMany({where:{id:lease.id,leaseUntil:lease.leaseUntil}});
    throw error;
  }
}

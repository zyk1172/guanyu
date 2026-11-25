import { after, NextResponse } from 'next/server';
import { AccessError, reserveAccessAttempt } from '@/lib/access';
import { articleCrawlerEnabled, crawlRecentArticles } from '@/lib/article-crawl';
import {
  FeedRefreshingError,
  homeNewsCacheKey,
  homeNewsPayload,
  loadLocalHomeSnapshot,
  readHomeSnapshot,
  refreshHomeSnapshot,
  type Snapshot,
} from '@/lib/home-news-service';
import { HOME_NEWS_REFRESH_MS, type HomeNewsResponse } from '@/lib/home-news-types';
import { requireClientIp } from '@/lib/rate-limit';
import { sameOriginResponse } from '@/lib/request-security';
import { getRssContext, type RssSource } from '@/lib/rss-service';
import { normalizeReportLanguage } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

const privateHeaders = { 'Cache-Control': 'private, no-store' };

function requestLanguage(request: Request) {
  return normalizeReportLanguage(new URL(request.url).searchParams.get('locale'));
}

function newsResponse(
  request: Request,
  snapshot: Snapshot,
  sources: RssSource[],
  language: string,
  cacheKey: string,
  options: { sharedVersion: string | null; stale?: boolean },
) {
  const headers = new Headers(privateHeaders);
  if (request.method === 'GET') {
    // Image tickets are renewed on the same hourly boundary as snapshot freshness.
    const hour = Math.floor(Date.now() / HOME_NEWS_REFRESH_MS);
    const etag = `"rss-v2-${cacheKey}-${language}-${options.sharedVersion}-${hour}"`;
    headers.set('ETag', etag);
    if (!options.stale && request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
  }
  const payload: HomeNewsResponse = {
    ...homeNewsPayload(snapshot, sources, language, options.stale),
    cacheKey,
    sharedVersion: options.sharedVersion,
  };
  return NextResponse.json(payload, { headers });
}

function unavailable(status = 503) {
  return NextResponse.json({ error: '新闻暂时无法读取，请稍后刷新，或使用关键词搜索。' }, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  try {
    const language = requestLanguage(request);
    const { sources, configSource } = await getRssContext(request);
    const crawl = configSource === 'admin' && articleCrawlerEnabled();
    const cacheKey = homeNewsCacheKey(sources, language);
    const cached = await readHomeSnapshot(cacheKey);
    if (cached?.stale) {
      after(async () => {
        try {
          const snapshot = await refreshHomeSnapshot(cacheKey, sources, language);
          if (crawl) await crawlRecentArticles(snapshot.headlines);
        } catch {
          // The last successful snapshot remains readable while upstream is unavailable.
        }
      });
    }
    const snapshot = cached?.data ?? await refreshHomeSnapshot(cacheKey, sources, language);
    if (!cached && crawl) after(() => crawlRecentArticles(snapshot.headlines).catch(() => {}));
    return newsResponse(request, snapshot, sources, language, cacheKey, {
      sharedVersion: snapshot.fetchedAt,
      stale: cached?.stale,
    });
  } catch (error) {
    return unavailable(error instanceof FeedRefreshingError ? 409 : 503);
  }
}

export async function POST(request: Request) {
  const rejected = sameOriginResponse(request);
  if (rejected) return rejected;
  try {
    await reserveAccessAttempt('home-news-refresh', requireClientIp(request), 3, 5 * 60_000);
    const language = requestLanguage(request);
    const { sources } = await getRssContext(request);
    const cacheKey = homeNewsCacheKey(sources, language);
    const cached = await readHomeSnapshot(cacheKey);
    const snapshot = await loadLocalHomeSnapshot(sources, language, cached?.data);
    return newsResponse(request, snapshot, sources, language, cacheKey, { sharedVersion: cached?.data.fetchedAt ?? null });
  } catch (error) {
    return unavailable(error instanceof AccessError ? error.status : 503);
  }
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { getOrCreateAppSetting, isByokPlan } from '@/lib/billing';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import {
  getEffectiveRssSourceConfig,
  getRssSourceCatalog,
  parseRssXml,
  resolveRssSources,
  validateCustomRssUrl,
} from '@/lib/rss-core.mjs';
import { assertPublicOutboundUrl, safeOutboundRequest } from '@/lib/safe-outbound';

type RssHeadline = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string;
};

type RssSource = {
  id: string;
  name: string;
  nameZh: string;
  region: string;
  country: string;
  feedUrl: string;
  websiteUrl: string;
  feedFormat?: 'rss' | 'html';
  rssAvailability: string;
  termsNote: string;
  termsNoteZh?: string;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 2 * 60 * 1000;

type CachedFeed = {
  expiresAt: number;
  headlines: RssHeadline[];
};

const feedCache = new Map<string, CachedFeed>();

function displaySource(source: RssSource) {
  return {
    id: source.id,
    name: source.name,
    nameZh: source.nameZh,
    region: source.region,
    country: source.country,
    websiteUrl: source.websiteUrl,
    rssAvailability: source.rssAvailability,
    termsNote: source.termsNote,
    termsNoteZh: source.termsNoteZh || (source.rssAvailability === 'official_public'
      ? '官方公开 RSS；展示与使用仍须遵守发布者条款。'
      : source.rssAvailability === 'official_headline_fallback'
        ? '官方首页标题源；官方旧 RSS 条目更新滞后，因此不作为默认内容源。'
        : '官方 RSS；商业展示或再利用须另行确认发布者授权。'),
  };
}

async function assertPublicRssUrl(value: string) {
  const normalized = validateCustomRssUrl(value);
  if (!normalized) throw new Error('RSS 地址不符合安全要求。');
  const { target } = await assertPublicOutboundUrl(normalized);
  return target;
}

async function fetchFeedXml(feedUrl: string) {
  let target = await assertPublicRssUrl(feedUrl);
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await safeOutboundRequest(target, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.8, */*;q=0.1',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'User-Agent': 'GuanyuRSS/1.0 (+https://guanyu-seven.vercel.app)',
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || attempt === MAX_REDIRECTS) throw new Error('RSS 重定向次数过多。');
      target = await assertPublicRssUrl(new URL(location, target).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`RSS 源返回异常状态 (${response.status})。`);
    return new TextDecoder().decode(response.body);
  }
  throw new Error('RSS 获取失败。');
}

async function getFeedHeadlines(source: RssSource) {
  const cached = feedCache.get(source.feedUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.headlines;

  const xml = await fetchFeedXml(source.feedUrl);
  const headlines = (parseRssXml(xml, source) as RssHeadline[]).filter((headline): headline is RssHeadline => Boolean(headline));
  feedCache.set(source.feedUrl, { headlines, expiresAt: Date.now() + CACHE_TTL_MS });
  return headlines;
}

function clientError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/超时|Timeout|Abort/i.test(message)) return 'RSS 源响应超时。';
  if (/状态/.test(message)) return 'RSS 源暂时不可用。';
  return 'RSS 源暂时无法读取。';
}

export async function GET(request: Request) {
  try {
    await ensureRuntimeSchema();
    const currentUser = await getCurrentUser(request);
    const appSetting = await getOrCreateAppSetting();
    let canUseOwnApi = false;
    let personalConfig: unknown = undefined;

    if (currentUser) {
      const [account, settings, isSuperAdmin] = await Promise.all([
        prisma.user.findUnique({ where: { id: currentUser.id }, select: { planType: true } }),
        prisma.userSettings.findUnique({ where: { userId: currentUser.id }, select: { rssFeedUrlsJson: true } }),
        getSuperAdminStatus(currentUser.id),
      ]);
      canUseOwnApi = isSuperAdmin || isByokPlan(account?.planType);
      personalConfig = settings?.rssFeedUrlsJson;
    }

    const config = getEffectiveRssSourceConfig({
      canUseOwnApi,
      adminConfig: appSetting.adminRssFeedIdsJson,
      personalConfig,
    });
    const sources = (resolveRssSources(config) as Array<RssSource | undefined>).filter((source): source is RssSource => Boolean(source));
    const settled = await Promise.allSettled(sources.map(async (source) => ({
      source,
      headlines: await getFeedHeadlines(source),
    })));
    const sourceErrors: Array<{ sourceId: string; message: string }> = [];
    const headlines = settled.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value.headlines.slice(0, 18);
      console.info('[rss-source-fetch]', JSON.stringify({
        sourceId: sources[index]?.id || 'unknown',
        reason: result.reason instanceof Error ? result.reason.message.slice(0, 180) : 'unknown',
      }));
      sourceErrors.push({ sourceId: sources[index]?.id || 'unknown', message: clientError(result.reason) });
      return [];
    });

    headlines.sort((a, b) => {
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      return bTime - aTime;
    });

    return NextResponse.json({
      sources: sources.map(displaySource),
      catalog: (getRssSourceCatalog() as Array<RssSource | undefined>).filter((source): source is RssSource => Boolean(source)).map(displaySource),
      config,
      configSource: canUseOwnApi ? 'personal' : 'admin',
      headlines,
      sourceErrors,
      fetchedAt: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    console.error('RSS headlines error:', error);
    return NextResponse.json({ error: 'RSS 新闻暂时无法加载，请稍后重试。' }, { status: 500 });
  }
}

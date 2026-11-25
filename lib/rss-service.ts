import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { getOrCreateAppSetting, hasActivePro } from '@/lib/billing';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import {
  RSS_SOURCE_CATALOG,
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
  summary?: string;
  imageUrl?: string;
};

export type RssSource = {
  id: string;
  name: string;
  nameZh: string;
  region: string;
  country: string;
  feedUrl: string;
  feedUrlZh?: string;
  headlineOnly?: boolean;
  websiteUrl: string;
  feedFormat?: 'rss' | 'html';
  rssAvailability: string;
  termsNote: string;
  termsNoteZh?: string;
};


const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
// These official XML feeds include article bodies even though we only consume metadata.
const EXTENDED_FEED_URLS = new Set(RSS_SOURCE_CATALOG
  .filter(source => source.headlineOnly)
  .flatMap(source => source.feedUrlZh ? [source.feedUrl, source.feedUrlZh] : [source.feedUrl]));
const MAX_OFFICIAL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 2 * 60 * 1000;

type CachedFeed = {
  expiresAt: number;
  xml: string;
};

const feedCache = new Map<string, CachedFeed>();
const feedPending = new Map<string, Promise<string>>();
let activeFetches = 0;

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

async function requestFeedXml(feedUrl: string) {
  const deadline=Date.now()+FETCH_TIMEOUT_MS;
  let target = await assertPublicRssUrl(feedUrl);
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const remaining=deadline-Date.now();if(remaining<=0)throw new Error('RSS 源响应超时。');
    const response = await safeOutboundRequest(target, {
      timeoutMs: remaining,
      maxBytes: EXTENDED_FEED_URLS.has(feedUrl) ? MAX_OFFICIAL_RESPONSE_BYTES : MAX_RESPONSE_BYTES,
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

export async function fetchFeedXml(feedUrl: string) {
  if (activeFetches >= 48) throw new Error('新闻源同步繁忙，请稍候。');
  activeFetches += 1;
  try {
    return await requestFeedXml(feedUrl);
  } finally {
    activeFetches -= 1;
  }
}

export async function getCachedFeedXml(feedUrl: string) {
  const cached = feedCache.get(feedUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.xml;
  let pending = feedPending.get(feedUrl);
  if (!pending) {
    if(feedPending.size>=40)throw new Error('新闻源同步繁忙，请稍候。');
    pending = fetchFeedXml(feedUrl).then(xml => {
      if (feedCache.size >= 64) feedCache.delete(feedCache.keys().next().value!);
      feedCache.set(feedUrl, { xml, expiresAt: Date.now() + CACHE_TTL_MS });
      return xml;
    }).finally(() => feedPending.delete(feedUrl));
    feedPending.set(feedUrl, pending);
  }
  return pending;
}
function clientError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/超时|Timeout|Abort/i.test(message)) return 'RSS 源响应超时。';
  if (/状态/.test(message)) return 'RSS 源暂时不可用。';
  return 'RSS 源暂时无法读取。';
}

export async function getRssContext(request: Request) {
    await ensureRuntimeSchema();
    const currentUser = await getCurrentUser(request);
    const appSetting = await getOrCreateAppSetting();
    let canUseOwnApi = false;
    let personalConfig: unknown = undefined;

    if (currentUser) {
      const [account, settings, isSuperAdmin] = await Promise.all([
        prisma.user.findUnique({ where: { id: currentUser.id }, select: { planType: true, proAccessExpiresAt: true } }),
        prisma.userSettings.findUnique({ where: { userId: currentUser.id }, select: { rssFeedUrlsJson: true } }),
        getSuperAdminStatus(currentUser.id),
      ]);
      canUseOwnApi = isSuperAdmin || hasActivePro(account || {});
      personalConfig = settings?.rssFeedUrlsJson;
    }

    const config = getEffectiveRssSourceConfig({
      canUseOwnApi,
      adminConfig: appSetting.adminRssFeedIdsJson,
      personalConfig,
    });
    const locale = new URL(request.url).searchParams.get('locale') || 'zh-CN';
    const sources = resolveRssSources(config).map(source => ({
      ...source,
      feedUrl: locale.startsWith('zh') ? source.feedUrlZh || source.feedUrl : source.feedUrl,
    }));
    return { sources, catalog: (getRssSourceCatalog() as RssSource[]).map(displaySource), config, configSource: canUseOwnApi ? 'personal' : 'admin' };
}

export async function loadRssSources(sources: RssSource[], readFeed = getCachedFeedXml) {
    const settled = await Promise.allSettled(sources.map(async source =>
      parseRssXml(await readFeed(source.feedUrl), source) as RssHeadline[],
    ));
    const sourceErrors: Array<{ sourceId: string; message: string }> = [];
    const headlines = settled.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value.slice(0, 30);
      const source = sources[index];
      const message = clientError(result.reason);
      console.info('[rss-source-fetch]', source.region === 'custom' ? 'custom' : source.id, message);
      sourceErrors.push({ sourceId: source.id, message });
      return [];
    });

    headlines.sort((a, b) => {
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      return bTime - aTime;
    });

    return { headlines, sourceErrors, fetchedAt: new Date().toISOString() };
}

export async function getRssPayload(request: Request) {
  const context = await getRssContext(request);
  const data = await loadRssSources(context.sources);
  return { ...context, sources: context.sources.map(displaySource), ...data };
}

import { readNewsArticle, type ParseResult } from './article-extraction';
import { ARTICLE_CRAWLER_AGENT, crawlUrl, robotsAllows } from './article-crawl-policy';
import { prisma } from './prisma';
import { privacyHmacHash } from './privacy-hash';
import { safeOutboundRequest } from './safe-outbound';
import type { HomeHeadline } from './home-news-types';

const HOUR = 60 * 60_000;
const CRAWLER_USER_AGENT = `${ARTICLE_CRAWLER_AGENT}/1.0 (+https://guanyu-seven.vercel.app)`;
const hosts = () => new Set((process.env.GUANYU_ARTICLE_CRAWL_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
const cacheKey = (url: URL) => `article-crawl:${privacyHmacHash(url.href)}`;

export function articleCrawlerEnabled() {
  return hosts().size > 0;
}

export async function readCrawledArticle(input: string): Promise<ParseResult | null> {
  const url = crawlUrl(input, hosts());
  if (!url) return null;
  const entry = await prisma.newsSearchCache.findUnique({ where: { cacheKey: cacheKey(url) } });
  if (!entry?.resultJson || entry.status !== 'COMPLETED' || entry.expiresAt <= new Date()) return null;
  try {
    return JSON.parse(entry.resultJson) as ParseResult;
  } catch {
    return null;
  }
}

export async function crawlRecentArticles(
  headlines: HomeHeadline[],
  transport = { request: safeOutboundRequest, read: readNewsArticle },
) {
  const approved = hosts();
  if (!approved.size) return;
  const sorted = [...headlines].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  const selected = new Map<string, URL[]>();
  const clock = Date.now();
  for (const headline of sorted) {
    const age = clock - Date.parse(headline.publishedAt);
    if (!Number.isFinite(age) || age < -5 * 60_000 || age > 2 * 24 * HOUR) continue;
    const url = crawlUrl(headline.url, approved);
    if (!url) continue;
    const entries = selected.get(url.host);
    if (entries && entries.length < 4 && !entries.some(entry => entry.href === url.href)) entries.push(url);
    else if (!entries && selected.size < 3) selected.set(url.host, [url]);
  }
  if (!selected.size) return;

  const now = Date.now();
  const lock = await prisma.newsSearchCache.createMany({
    data: [{ cacheKey: `article-crawl:slot:${Math.floor(now / HOUR)}`, status: 'COMPLETED', leaseUntil: new Date(0), expiresAt: new Date(now + 2 * HOUR) }],
    skipDuplicates: true,
  });
  if (!lock.count) return;
  await prisma.newsSearchCache.deleteMany({ where: { cacheKey: { startsWith: 'article-crawl:' }, expiresAt: { lt: new Date(now) } } });

  await Promise.all([...selected.values()].map(async candidates => {
    try {
      const robots = await transport.request(new URL('/robots.txt', candidates[0]), {
        headers: { 'User-Agent': CRAWLER_USER_AGENT }, requireHttps: true,
        maxBytes: 64 * 1024, timeoutMs: 2_000,
      });
      if (robots.status !== 200 && robots.status !== 404) return;
      const rules = robots.status === 200 ? robots.body.toString('utf8') : '';
      const permits = (target: URL) => target.origin === candidates[0].origin && robotsAllows(rules, target);
      let url: URL | undefined;
      for (const candidate of candidates) {
        if (permits(candidate) && !await readCrawledArticle(candidate.href)) {
          url = candidate;
          break;
        }
      }
      if (!url) return;
      const article = await transport.read(url.href, { userAgent: CRAWLER_USER_AGENT, timeoutMs: 6_000, permits });
      const data = {
        status: 'COMPLETED', resultJson: JSON.stringify(article),
        leaseUntil: new Date(0), expiresAt: new Date(Date.now() + 24 * HOUR),
      };
      const key = cacheKey(url);
      await prisma.newsSearchCache.upsert({ where: { cacheKey: key }, create: { cacheKey: key, ...data }, update: data });
    } catch {
      // One publisher's restrictions, outage, or unreadable article do not stop the batch.
    }
  }));
}

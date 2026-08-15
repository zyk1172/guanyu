import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

/**
 * Curated feeds are official publisher endpoints that were live when added.
 * They are a discovery list, not a truth or political-bias ranking. Feed use
 * remains subject to every publisher's terms; the UI shows only attribution,
 * headline, time and an outbound link.
 */
export const RSS_SOURCE_CATALOG = [
  {
    id: 'bbc-news',
    name: 'BBC News',
    nameZh: 'BBC 新闻',
    region: 'international',
    country: 'United Kingdom',
    feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml',
    websiteUrl: 'https://www.bbc.com/news',
    rssAvailability: 'official_with_terms',
    termsNote: 'Official headline feed. Commercial use requires publisher permission.',
  },
  {
    id: 'new-york-times',
    name: 'The New York Times',
    nameZh: '纽约时报',
    region: 'international',
    country: 'United States',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    websiteUrl: 'https://www.nytimes.com',
    rssAvailability: 'official_with_terms',
    termsNote: 'Official headline feed. Use is subject to publisher terms.',
  },
  {
    id: 'the-guardian',
    name: 'The Guardian',
    nameZh: '卫报',
    region: 'international',
    country: 'United Kingdom',
    feedUrl: 'https://www.theguardian.com/world/rss',
    websiteUrl: 'https://www.theguardian.com',
    rssAvailability: 'official_with_terms',
    termsNote: 'Official headline feed. Commercial reuse may require a licence.',
  },
  {
    id: 'npr-news',
    name: 'NPR News',
    nameZh: '美国国家公共广播电台',
    region: 'international',
    country: 'United States',
    feedUrl: 'https://feeds.npr.org/1001/rss.xml',
    websiteUrl: 'https://www.npr.org',
    rssAvailability: 'official_with_terms',
    termsNote: 'Official headline feed. Use is subject to publisher terms.',
  },
  {
    id: 'dw-news',
    name: 'DW News',
    nameZh: '德国之声',
    region: 'international',
    country: 'Germany',
    feedUrl: 'https://rss.dw.com/rdf/rss-en-all',
    websiteUrl: 'https://www.dw.com',
    rssAvailability: 'official_with_terms',
    termsNote: 'Official headline feed. Use is subject to publisher terms.',
  },
  {
    id: 'china-news-service',
    name: 'China News Service',
    nameZh: '中国新闻网',
    region: 'china',
    country: 'China',
    feedUrl: 'https://www.chinanews.com.cn/rss/scroll-news.xml',
    websiteUrl: 'https://www.chinanews.com.cn',
    rssAvailability: 'official_public',
    termsNote: 'Official public RSS endpoint; attribution and source terms still apply.',
  },
  {
    id: 'people-daily',
    name: "People's Daily",
    nameZh: '人民日报',
    region: 'china',
    country: 'China',
    feedUrl: 'https://www.people.com.cn/',
    websiteUrl: 'https://www.people.com.cn',
    feedFormat: 'html',
    rssAvailability: 'official_headline_fallback',
    termsNote: 'Official People.cn homepage headline source. The legacy official RSS feed is retained by the publisher but currently returns outdated items.',
  },
  {
    id: 'rthk-news',
    name: 'RTHK News',
    nameZh: '香港电台',
    region: 'china',
    country: 'Hong Kong, China',
    feedUrl: 'https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml',
    websiteUrl: 'https://news.rthk.hk/rthk/ch/',
    rssAvailability: 'official_public',
    termsNote: 'Official Hong Kong public-broadcaster news feed. Attribution and source terms still apply.',
  },
];

export const DEFAULT_RSS_FEED_IDS = RSS_SOURCE_CATALOG.map((source) => source.id);

const CATALOG_BY_ID = new Map(RSS_SOURCE_CATALOG.map((source) => [source.id, source]));
const LEGACY_CATALOG_ID_MAP = {
  'south-china-morning-post': 'people-daily',
  'initium-media': 'rthk-news',
  'china-daily': 'people-daily',
  'ming-pao': 'rthk-news',
};
const MAX_CATALOG_FEEDS = RSS_SOURCE_CATALOG.length;
const MAX_CUSTOM_FEEDS = 5;
const MAX_NAME_LENGTH = 80;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  processEntities: false,
});

function list(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function objectValue(value) {
  return value && typeof value === 'object' ? value : {};
}

function text(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) return text(value[0]);
  const node = objectValue(value);
  return text(node['#text'] ?? node.__cdata ?? node.cdata ?? node.value ?? '');
}

function attr(node, key) {
  return String(objectValue(node)[`@_${key}`] || '').trim();
}

function itemUrl(value) {
  for (const candidate of list(value)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    const href = attr(candidate, 'href');
    const rel = attr(candidate, 'rel');
    if (href && (!rel || rel === 'alternate')) return href;
  }
  return '';
}

function firstText(item, keys) {
  for (const key of keys) {
    const value = text(item?.[key]);
    if (value) return value;
  }
  return '';
}

function parsedDate(value) {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function safeHeadlineUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function peopleDailyPublishedAt(url) {
  const matched = url.match(/\/n\d\/(20\d{2})\/(\d{2})(\d{2})\//);
  if (!matched) return '';
  const [, year, month, day] = matched;
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
}

function parsePeopleDailyHomepage(html, source) {
  const $ = cheerio.load(html || '');
  const seen = new Set();
  const headlines = [];

  $('#rm_topline a, #rm_topread a, #aq_two a, .news-content a, .blist1 a, .list_dw a').each((_, anchor) => {
    if (headlines.length >= 40) return false;
    const title = $(anchor).text().replace(/\s+/g, ' ').trim();
    const href = $(anchor).attr('href') || '';
    if (title.length < 2 || !href) return;

    let url = '';
    try {
      url = new URL(href, source.feedUrl).toString();
    } catch {
      return;
    }
    if (!/(^|\.)people\.com\.cn$/i.test(new URL(url).hostname) || seen.has(url)) return;

    seen.add(url);
    headlines.push({
      id: `${source.id}:${url}`,
      sourceId: source.id,
      sourceName: source.name,
      title,
      url,
      publishedAt: peopleDailyPublishedAt(url),
    });
  });

  return headlines;
}

function rootBySuffix(document, suffix) {
  return Object.entries(objectValue(document)).find(([key]) => key === suffix || key.endsWith(`:${suffix}`))?.[1];
}

function normalizeEntry(raw, source) {
  const title = firstText(raw, ['title']).replace(/\s+/g, ' ').trim().slice(0, 500);
  const url = safeHeadlineUrl(itemUrl(raw?.link) || firstText(raw, ['guid', 'id']));
  if (!title || !url) return null;

  return {
    id: `${source.id}:${url}`,
    sourceId: source.id,
    sourceName: source.name,
    title,
    url,
    publishedAt: parsedDate(firstText(raw, ['pubDate', 'published', 'updated', 'date', 'dc:date', 'dc:Date'])),
  };
}

export function parseRssXml(xml, source) {
  if (typeof xml !== 'string' || !xml.trim() || !source?.id) return [];
  if (source.feedFormat === 'html') return parsePeopleDailyHomepage(xml, source);
  let document;
  try {
    document = xmlParser.parse(xml);
  } catch {
    return [];
  }

  const rssItems = list(document?.rss?.channel?.item);
  const rdfItems = list(rootBySuffix(document, 'RDF')?.item);
  const atomItems = list(document?.feed?.entry);
  const items = [...rssItems, ...rdfItems, ...atomItems];
  const seen = new Set();

  return items
    .map((item) => normalizeEntry(item, source))
    .filter((item) => item && !seen.has(item.id) && seen.add(item.id))
    .slice(0, 40);
}

export function isPrivateIpAddress(value) {
  const input = String(value || '').trim().toLowerCase();
  if (!input) return false;
  if (input === '::1' || input === '0:0:0:0:0:0:0:1') return true;
  if (input.startsWith('fc') || input.startsWith('fd') || input.startsWith('fe8') || input.startsWith('fe9') || input.startsWith('fea') || input.startsWith('feb')) return true;

  const parts = input.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function validateCustomRssUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !hostname) return '';
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0' || isPrivateIpAddress(hostname)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function normalizeRssSourceConfig(input) {
  const raw = objectValue(input);
  const catalogIds = [];
  for (const rawId of list(raw.catalogIds).map((item) => String(item || '').trim())) {
    const id = LEGACY_CATALOG_ID_MAP[rawId] || rawId;
    if (CATALOG_BY_ID.has(id) && !catalogIds.includes(id)) catalogIds.push(id);
    if (catalogIds.length >= MAX_CATALOG_FEEDS) break;
  }

  const customFeeds = [];
  for (const item of list(raw.customFeeds)) {
    const url = validateCustomRssUrl(item?.url);
    if (!url || customFeeds.some((feed) => feed.url === url)) continue;
    const name = String(item?.name || new URL(url).hostname).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
    customFeeds.push({ name, url });
    if (customFeeds.length >= MAX_CUSTOM_FEEDS) break;
  }

  return { catalogIds, customFeeds };
}

export function parseRssSourceConfig(value, fallbackCatalogIds = DEFAULT_RSS_FEED_IDS) {
  if (!value) return { catalogIds: [...fallbackCatalogIds], customFeeds: [] };
  try {
    const normalized = normalizeRssSourceConfig(typeof value === 'string' ? JSON.parse(value) : value);
    return normalized.catalogIds.length || normalized.customFeeds.length
      ? normalized
      : { catalogIds: [...fallbackCatalogIds], customFeeds: [] };
  } catch {
    return { catalogIds: [...fallbackCatalogIds], customFeeds: [] };
  }
}

export function getEffectiveRssSourceConfig({ canUseOwnApi, adminConfig, personalConfig }) {
  const normalizedAdmin = parseRssSourceConfig(adminConfig, DEFAULT_RSS_FEED_IDS);
  if (!canUseOwnApi) return normalizedAdmin;

  const normalizedPersonal = parseRssSourceConfig(personalConfig, []);
  return normalizedPersonal.catalogIds.length || normalizedPersonal.customFeeds.length
    ? normalizedPersonal
    : normalizedAdmin;
}

export function resolveRssSources(config) {
  const normalized = normalizeRssSourceConfig(config);
  return [
    ...normalized.catalogIds.map((id) => CATALOG_BY_ID.get(id)).filter(Boolean),
    ...normalized.customFeeds.map((feed, index) => ({
      id: `custom-${index}-${feed.url}`,
      name: feed.name,
      nameZh: feed.name,
      region: 'custom',
      country: '',
      feedUrl: feed.url,
      websiteUrl: new URL(feed.url).origin,
      rssAvailability: 'user_configured',
      termsNote: 'User-configured feed. Confirm the publisher permits your intended use.',
    })),
  ];
}

export function getRssSourceCatalog() {
  return RSS_SOURCE_CATALOG.map((source) => ({
    ...source,
    termsNoteZh: source.rssAvailability === 'official_public'
      ? '官方公开 RSS；展示与使用仍须遵守发布者条款。'
      : '官方 RSS；商业展示或再利用须另行确认发布者授权。',
  }));
}

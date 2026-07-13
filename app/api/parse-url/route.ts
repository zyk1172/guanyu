import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { extractPublishedDate, normalizeDate } from '@/lib/publishedDate.mjs';
import { assertPublicOutboundUrl, safeOutboundRequest } from '@/lib/safe-outbound';

export const maxDuration = 30;
export const runtime = 'nodejs';

const MAX_RESPONSE_BYTES = 2_500_000;
const MAX_REDIRECTS = 4;

interface ParseResult {
  title: string;
  source: string;
  date: string;
  publishedAt: string;
  publishedAtSource: string;
  publishedAtConfidence: string;
  content: string;
  url: string;
}

interface FetchedHtml {
  html: string;
  finalUrl: string;
}

function cleanTitle(rawTitle: string): string {
  const normalized = rawTitle
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:\||–|—)\s+[^|–—]+$/, '')
    .replace(/\s+-\s+[A-Za-z][A-Za-z0-9 .&'’]{1,50}$/, '')
    .trim();

  const half = Math.floor(normalized.length / 2);
  if (
    normalized.length > 8 &&
    normalized.length % 2 === 0 &&
    normalized.slice(0, half) === normalized.slice(half)
  ) {
    return normalized.slice(0, half).trim();
  }

  return normalized;
}

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'video',
  'audio',
  '[style*="display:none"]',
  '[style*="display: none"]',
  '[hidden]',
  '.ad',
  '.ads',
  '.advertisement',
  '.sidebar',
  '.comment',
  '.comments',
  '.social-share',
  '.related-posts',
  '.recommendation',
  '.related',
  '.related-content',
  '.recommended',
  '.newsletter',
  '.paywall',
  '.consent',
  '.cookie',
  '.sticky',
  '.modal',
  '[data-testid*="related"]',
  '[data-testid*="recommend"]',
  '[data-testid*="newsletter"]',
  '[data-testid*="advert"]',
  '[data-component*="related"]',
  '[data-component*="newsletter"]',
  '.art-btn',
  '.bottom',
  '.paper-box',
  '.time-box',
  '.date-box',
  '.menu',
  '.head',
  '#daydh',
  '#ZQBbbx',
].join(', ');

const ARTICLE_SELECTORS = [
  'founder-content',
  '[itemprop="articleBody"]',
  '[property="articleBody"]',
  '[data-testid="article-body"]',
  '[data-testid*="article-body"]',
  '[data-qa="article-body"]',
  '[data-component-name="article-body"]',
  '[data-gu-name="body"]',
  '.article__body',
  '.article__content',
  '.article__content-body',
  '.article-content__body',
  '.article-content__content',
  '.story__body',
  '.story-body__inner',
  '.post__body',
  '.c-article-content',
  '.longText',
  '.storytext',
  '#content.article-text',
  '#articleContent',
  '.article-text',
  '.article-content',
  '.article_body',
  '.article-body',
  '.post-content',
  '.entry-content',
  '.news-content',
  '.story',
  '.story-body',
  '.text',
  '.whitecon',
  '.article-box .article',
  'article',
  '[role="main"]',
  'main',
  '#content',
  '.content',
];

const SITE_ARTICLE_SELECTORS: Record<string, string[]> = {
  'reuters.com': ['[data-testid="article-body"]', '[data-testid*="article-body"]'],
  'apnews.com': ['[data-testid="article-content"]', '[data-key="article-body"]'],
  'bbc.com': ['[data-testid="article-body"]', '[data-component="text-block"]'],
  'cnn.com': ['.article__content', '[data-component-name="article-body"]'],
  'nytimes.com': ['[data-testid="article-body"]', '[data-testid="articleBody"]'],
  'washingtonpost.com': ['[data-qa="article-body"]', '.article-body'],
  'theguardian.com': ['[data-gu-name="body"]', '.article-body-commercial-selector'],
  'npr.org': ['.storytext', '.story-text'],
  'ft.com': ['.article__content-body', '.article-body'],
  'dw.com': ['.longText', '.article__body'],
  'france24.com': ['.article__content', '.article-content'],
  'euronews.com': ['.c-article-content', '.article__content'],
  'lemonde.fr': ['.article__content', '.article__content--desktop'],
  'spiegel.de': ['[data-testid="article-body"]', '.article-section'],
  'independent.co.uk': ['.article-body', '.sc-article-body'],
};

function isBoilerplateLine(line: string): boolean {
  const compact = line.replace(/\s+/g, '');
  if (compact.length < 6) return true;

  const exactNoise = new Set([
    '上一版',
    '下一版',
    '上一篇',
    '下一篇',
    '返回目录',
    '返回首页',
    '全文复制',
    '放大',
    '缩小',
    '关闭',
    '新闻检索',
    '中国青年报客户端',
    '中国青年报官方微信',
    '中青报系',
    '中国青年作家报',
    'Advertisement',
    'ADVERTISEMENT',
    'Skip to content',
    'Read more',
    'Related articles',
    'Recommended stories',
    'Sign up for our newsletter',
    'Privacy settings',
    'Alle Rechte vorbehalten',
    'Publicité',
  ]);
  if (exactNoise.has(compact)) return true;

  const noisePatterns = [
    /^第\d+版[:：]/,
    /^20\d{2}年\d{2}月\d{2}日\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)?$/i,
    /^往期回顾$/,
    /^20\d{2}-20\d{2}年回顾$/,
    /^日一二三四五六$/,
    /^来源[:：].{0,30}$/,
    /^中青报[·•]中青网记者\s*.+来源[:：]/,
  ];
  if (noisePatterns.some((pattern) => pattern.test(compact))) return true;

  const navTokens = ['上一版', '下一版', '返回目录', '返回首页', '上一篇', '下一篇', '全文复制', 'Subscribe', 'Sign in', 'Read more', 'Recommended', 'Advertisement', 'Cookie'];
  const navHits = navTokens.filter((token) => compact.includes(token)).length;
  return navHits >= 2;
}

function normalizeExtractedText(rawText: string): string {
  const seen = new Set<string>();
  return rawText
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n')
    .map((line) => line.trim().replace(/^　+/, '').trim())
    .filter((line) => !isBoilerplateLine(line))
    .filter((line) => {
      const key = line.replace(/\s+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function assertPublicHttpUrl(input: string): Promise<URL> {
  try {
    const { target } = await assertPublicOutboundUrl(input);
    return target;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'URL 格式无效。');
  }
}

function charsetFromContentType(contentType: string) {
  const match = contentType.match(/charset=([^;\s]+)/i);
  return match?.[1]?.replace(/["']/g, '').toLowerCase() || 'utf-8';
}

function decodeHtmlBuffer(buffer: ArrayBuffer | Uint8Array, contentType: string) {
  const charset = charsetFromContentType(contentType);
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchHtmlWithRedirects(initialUrl: string): Promise<FetchedHtml> {
  let currentUrl = (await assertPublicHttpUrl(initialUrl)).toString();

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const response = await safeOutboundRequest(currentUrl, {
      timeoutMs: 15_000,
      maxBytes: MAX_RESPONSE_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,fr;q=0.6,de;q=0.6,es;q=0.6,it;q=0.6',
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('目标网页跳转但没有返回 Location。');
      currentUrl = (await assertPublicHttpUrl(new URL(location, currentUrl).toString())).toString();
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`请求失败 (状态码 ${response.status})。`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('/xhtml') && !contentType.includes('xml')) {
      throw new Error(`该链接看起来不是网页 (Content-Type: ${contentType})。`);
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error('网页体积过大，请粘贴正文后再审视。');
    }

    return {
      html: decodeHtmlBuffer(response.body, contentType),
      finalUrl: currentUrl,
    };
  }

  throw new Error('网页跳转次数过多，已停止抓取。');
}

function flattenJsonLd(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value['@graph']) return [value, ...flattenJsonLd(value['@graph'])];
  return [value];
}

function readJsonLdObjects($: cheerio.CheerioAPI) {
  const objects: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text()
      .replace(/^\s*<!--/, '')
      .replace(/-->\s*$/, '')
      .replace(/^\s*<!\[CDATA\[/, '')
      .replace(/\]\]>\s*$/, '')
      .trim();
    if (!raw) return;
    try {
      objects.push(...flattenJsonLd(JSON.parse(raw)));
    } catch {
      // Ignore invalid JSON-LD blocks; many sites include tracking fragments here.
    }
  });
  return objects;
}

function firstMeta($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = $(selector).first().attr('content') || $(selector).first().attr('value') || '';
    if (value.trim()) return value.trim();
  }
  return '';
}

function firstValue(values: Array<{ value: string; source: string; confidence: string }>) {
  return values.find((item) => normalizeDate(item.value)) || null;
}

function publisherName(value: unknown) {
  if (Array.isArray(value)) return publisherName(value[0]);
  if (value && typeof value === 'object') {
    const publisher = value as Record<string, unknown>;
    return String(publisher.name || publisher.alternateName || '').trim();
  }
  return String(value || '').trim();
}

function extractStructuredMetadata($: cheerio.CheerioAPI) {
  const jsonLd = readJsonLdObjects($);
  const article = jsonLd.find((item) => {
    const type = Array.isArray(item['@type']) ? item['@type'].join(' ') : String(item['@type'] || '');
    return /NewsArticle|Article|Reportage|BlogPosting/i.test(type);
  }) || jsonLd[0] || {};

  const headline = String(article.headline || article.name || '').trim();
  const sourceName = publisherName(article.publisher || article.sourceOrganization || article.provider);
  const dateCandidate = firstValue([
    { value: String(article.datePublished || article.dateCreated || '').trim(), source: 'json_ld', confidence: 'high' },
    { value: firstMeta($, ['meta[property="article:published_time"]', 'meta[name="article:published_time"]']), source: 'meta_article', confidence: 'high' },
    { value: firstMeta($, ['meta[property="og:published_time"]']), source: 'meta_og', confidence: 'high' },
    { value: firstMeta($, [
      'meta[name="parsely-pub-date"]',
      'meta[name="sailthru.date"]',
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'meta[name="publish_date"]',
      'meta[itemprop="datePublished"]',
    ]), source: 'meta_pubdate', confidence: 'medium' },
    { value: $('time[datetime]').first().attr('datetime') || '', source: 'time_tag', confidence: 'medium' },
  ]);
  const dateModified = String(article.dateModified || '').trim();
  const structuredBody = String(article.articleBody || article.text || '').trim();

  return {
    title: headline || firstMeta($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
      'meta[name="parsely-title"]',
      'meta[name="sailthru.title"]',
      'meta[itemprop="headline"]',
    ]),
    source: sourceName || firstMeta($, [
      'meta[property="og:site_name"]',
      'meta[name="application-name"]',
      'meta[name="source"]',
      'meta[name="publisher"]',
      'meta[name="parsely-author"]',
    ]),
    publishedAt: dateCandidate?.value || '',
    publishedAtSource: dateCandidate?.source || 'unknown',
    publishedAtConfidence: dateCandidate?.confidence || 'unknown',
    modifiedAt: dateModified || firstMeta($, [
      'meta[property="article:modified_time"]',
      'meta[itemprop="dateModified"]',
    ]),
    structuredBody,
  };
}

function siteSelectorsForUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const matched = Object.entries(SITE_ARTICLE_SELECTORS)
      .find(([domain]) => host === domain || host.endsWith(`.${domain}`));
    return matched?.[1] || [];
  } catch {
    return [];
  }
}

function scoreArticleCandidate($el: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI, text: string, title: string, selectorBonus = 0) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length < 180) return Number.NEGATIVE_INFINITY;

  const paragraphCount = $el.find('p').length;
  const linkTextLength = $el.find('a').text().replace(/\s+/g, ' ').trim().length;
  const linkRatio = linkTextLength / Math.max(compact.length, 1);
  const punctuationCount = (compact.match(/[.!?。！？]/g) || []).length;
  const attributes = `${$el.attr('id') || ''} ${$el.attr('class') || ''} ${$el.attr('data-testid') || ''} ${$el.attr('data-component') || ''}`.toLowerCase();
  const titleTokens = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 4).slice(0, 8);
  const titleHits = titleTokens.filter((token) => compact.toLowerCase().includes(token)).length;
  const semanticBonus = /article|story|post|entry|content|body|longtext|text-block/.test(attributes) ? 900 : 0;
  const noisePenalty = /related|recommend|newsletter|advert|promo|cookie|comment|footer|header|navigation|sidebar/.test(attributes) ? 2400 : 0;
  const nestedArticlePenalty = $el.is('div, section') && $el.find('article, main').length > 0 ? 1400 : 0;

  return (
    Math.min(compact.length, 16_000) * 0.82
    + Math.min(paragraphCount * 320, 3_200)
    + Math.min(punctuationCount * 18, 1_100)
    + titleHits * 140
    + semanticBonus
    + selectorBonus
    - linkRatio * Math.min(compact.length, 10_000)
    - noisePenalty
    - nestedArticlePenalty
  );
}

function extractBestArticleText($: cheerio.CheerioAPI, title: string, url: string, structuredBody: string) {
  const candidates: Array<{ node?: AnyNode; text?: string; score: number }> = [];
  const seen = new Set<AnyNode>();

  const addCandidate = (node: AnyNode, selectorBonus = 0) => {
    if (seen.has(node)) return;
    seen.add(node);
    const $node = $(node);
    const text = normalizeExtractedText($node.text());
    const score = scoreArticleCandidate($node, $, text, title, selectorBonus);
    if (Number.isFinite(score)) candidates.push({ node, score });
  };

  const selectors = [...siteSelectorsForUrl(url), ...ARTICLE_SELECTORS];
  selectors.forEach((selector, index) => {
    $(selector).slice(0, 12).each((_, element) => addCandidate(element, Math.max(200, 1_800 - index * 45)));
  });

  let genericCount = 0;
  $('article, main, [role="main"], section, div').each((_, element) => {
    if (genericCount >= 420) return false;
    const $element = $(element);
    const rawLength = $element.text().trim().length;
    if (rawLength < 220 || rawLength > 50_000) return;
    genericCount += 1;
    addCandidate(element, $element.is('article, main, [role="main"]') ? 1_000 : 0);
  });

  const normalizedStructuredBody = normalizeExtractedText(structuredBody);
  if (normalizedStructuredBody.length >= 300) {
    candidates.push({ text: normalizedStructuredBody, score: normalizedStructuredBody.length * 0.88 + 1_200 });
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (best?.node) return extractText($(best.node), $);
  return best?.text || extractText($('body'), $);
}

function parseHtml(html: string, url: string): ParseResult {
  const $ = cheerio.load(html);
  const metadata = extractStructuredMetadata($);

  $(REMOVE_SELECTORS).remove();

  const title = cleanTitle(metadata.title
    || $('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || $('#NewsArticleTitle').text()
    || $('.article h1, .article-title, h1').first().text()
    || $('title').text()
    || '');

  const source = metadata.source
    || $('meta[property="og:site_name"]').attr('content')
    || $('meta[name="source"]').attr('content')
    || $('meta[name="publisher"]').attr('content')
    || $('#NewsArticleSource').text()
    || (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })()
    || '';

  const content = extractBestArticleText($, title, url, metadata.structuredBody).slice(0, 15_000);

  const extractedPublished = extractPublishedDate(html, source);
  const structuredPublishedAt = normalizeDate(metadata.publishedAt);
  const published = structuredPublishedAt
    ? {
        publishedAt: structuredPublishedAt,
        publishedAtSource: metadata.publishedAtSource,
        publishedAtConfidence: metadata.publishedAtConfidence,
      }
    : extractedPublished;
  const date = published.publishedAt;

  return {
    title,
    source,
    date,
    publishedAt: published.publishedAt,
    publishedAtSource: published.publishedAtSource,
    publishedAtConfidence: published.publishedAtConfidence,
    content,
    url,
  };
}

function extractText($el: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI): string {
  const $clone = $el.clone();
  $clone.find(REMOVE_SELECTORS).remove();

  $clone.find('br').replaceWith('\n');
  $clone.find('p, div, section, li, h1, h2, h3, h4, h5, h6, article, blockquote, pre').each((_, el) => {
    $(el).before('\n').after('\n');
  });

  return normalizeExtractedText($clone.text());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '缺少 URL 参数。' }, { status: 400 });
    }

    const { html, finalUrl } = await fetchHtmlWithRedirects(url);

    if (html.length < 500) {
      return NextResponse.json({ error: '页面内容过少，可能是登录墙或空页面。' }, { status: 400 });
    }

    const result = parseHtml(html, finalUrl);

    if (!result.content || result.content.length < 50) {
      return NextResponse.json({ error: '无法提取正文内容，可能是动态渲染页面或登录墙。' }, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: '抓取超时，请检查链接或稍后重试。' }, { status: 504 });
    }
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message) {
      const status = message.includes('内网') || message.includes('localhost') || message.includes('协议') || message.includes('URL 格式') || message.includes('受限制') || message.includes('外部服务地址')
        ? 400
        : message.includes('超时')
          ? 504
          : 500;
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Parse-url error:', error);
    return NextResponse.json({ error: '网页解析失败，请重试。' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { extractPublishedDate } from '@/lib/publishedDate.mjs';

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
    .replace(/\s*[|\-–—]\s*.+$/, '')
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
  '#content.article-text',
  '#content',
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
  '.content',
  '.article-box .article',
  'article',
  'main',
];

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

  const navTokens = ['上一版', '下一版', '返回目录', '返回首页', '上一篇', '下一篇', '全文复制'];
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

function isPrivateIPv4(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIPv6(ip: string) {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

async function assertPublicHttpUrl(input: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('URL 格式无效。');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http(s) 协议。');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('出于安全原因，不支持抓取 localhost 或内网地址。');
  }

  const ipType = net.isIP(host);
  if ((ipType === 4 && isPrivateIPv4(host)) || (ipType === 6 && isPrivateIPv6(host))) {
    throw new Error('出于安全原因，不支持抓取内网、回环或链路本地地址。');
  }

  if (!ipType) {
    const addresses = await lookup(host, { all: true, verbatim: false });
    if (!addresses.length) throw new Error('无法解析该域名。');
    for (const address of addresses) {
      if ((address.family === 4 && isPrivateIPv4(address.address)) || (address.family === 6 && isPrivateIPv6(address.address))) {
        throw new Error('出于安全原因，域名解析到了内网地址，已拒绝抓取。');
      }
    }
  }

  return parsed;
}

function charsetFromContentType(contentType: string) {
  const match = contentType.match(/charset=([^;\s]+)/i);
  return match?.[1]?.replace(/["']/g, '').toLowerCase() || 'utf-8';
}

function decodeHtmlBuffer(buffer: ArrayBuffer, contentType: string) {
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(currentUrl, {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('目标网页跳转但没有返回 Location。');
      currentUrl = (await assertPublicHttpUrl(new URL(location, currentUrl).toString())).toString();
      continue;
    }

    if (!response.ok) {
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

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error('网页体积过大，请粘贴正文后再审视。');
    }

    return {
      html: decodeHtmlBuffer(buffer, contentType),
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
    const raw = $(el).contents().text().trim();
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

function extractStructuredMetadata($: cheerio.CheerioAPI) {
  const jsonLd = readJsonLdObjects($);
  const article = jsonLd.find((item) => {
    const type = Array.isArray(item['@type']) ? item['@type'].join(' ') : String(item['@type'] || '');
    return /NewsArticle|Article|Reportage|BlogPosting/i.test(type);
  }) || jsonLd[0] || {};

  const headline = String(article.headline || article.name || '').trim();
  const sourceName = typeof article.publisher === 'object'
    ? String(article.publisher.name || '').trim()
    : String(article.publisher || '').trim();
  const datePublished = String(article.datePublished || article.dateCreated || '').trim();
  const dateModified = String(article.dateModified || '').trim();

  return {
    title: headline || firstMeta($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
    ]),
    source: sourceName || firstMeta($, [
      'meta[property="og:site_name"]',
      'meta[name="application-name"]',
      'meta[name="source"]',
      'meta[name="publisher"]',
    ]),
    publishedAt: datePublished || firstMeta($, [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'meta[name="publish_date"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]',
    ]) || $('time[datetime]').first().attr('datetime') || '',
    modifiedAt: dateModified || firstMeta($, [
      'meta[property="article:modified_time"]',
      'meta[itemprop="dateModified"]',
    ]),
  };
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

  const content = (() => {
    for (const selector of ARTICLE_SELECTORS) {
      const node = $(selector).first();
      const text = node.length ? extractText(node, $) : '';
      if (text.length > 200) return text;
    }

    const candidates = $('div').map((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const tagCount = $el.find('*').length;
      const density = text.length / Math.max(tagCount, 1);
      return { el, text, density, length: text.length };
    }).get();

    candidates.sort((a, b) => {
      if (Math.abs(a.length - b.length) < 100) return b.density - a.density;
      return b.length - a.length;
    });

    const best = candidates.find(c => c.length > 200 && c.density > 2);
    if (best) return normalizeExtractedText(best.text);

    return extractText($('body'), $);
  })().slice(0, 15000);

  const extractedPublished = extractPublishedDate(html, source);
  const published = metadata.publishedAt
    ? {
        publishedAt: metadata.publishedAt,
        publishedAtSource: metadata.publishedAt.includes('T') ? 'json_ld' : 'meta_article',
        publishedAtConfidence: 'high',
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
      const status = message.includes('内网') || message.includes('localhost') || message.includes('协议') || message.includes('URL 格式')
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

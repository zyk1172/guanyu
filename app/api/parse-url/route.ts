import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export const maxDuration = 30;

interface ParseResult {
  title: string;
  source: string;
  date: string;
  content: string;
  url: string;
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
  '#articleContent',
  '#daydh',
  '#ZQBbbx',
].join(', ');

const ARTICLE_SELECTORS = [
  'founder-content',
  '#content.article-text',
  '#content',
  '.article-text',
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

function parseHtml(html: string, url: string): ParseResult {
  const $ = cheerio.load(html);

  $(REMOVE_SELECTORS).remove();

  const title = cleanTitle($('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || $('#NewsArticleTitle').text()
    || $('.article h1, .article-title, h1').first().text()
    || $('title').text()
    || '');

  const source = $('meta[property="og:site_name"]').attr('content')
    || $('meta[name="source"]').attr('content')
    || $('meta[name="publisher"]').attr('content')
    || $('#NewsArticleSource').text()
    || (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })()
    || '';

  const rawDate = $('meta[property="article:published_time"]').attr('content')
    || $('meta[name="publishdate"]').attr('content')
    || $('meta[name="date"]').attr('content')
    || $('meta[name="DC.date.issued"]').attr('content')
    || $('#NewsArticlePubDay').text()
    || '';
  const date = rawDate
    .replace('T', ' ')
    .slice(0, 16);

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

  return { title, source, date, content, url };
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

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'URL 格式无效。' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: '仅支持 http(s) 协议。' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `请求失败 (状态码 ${response.status})。` },
        { status: 500 }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('/xhtml') && !contentType.includes('xml')) {
      return NextResponse.json({ error: '该链接看起来不是网页 (Content-Type: ' + contentType + ')。' }, { status: 400 });
    }

    const html = await response.text();

    if (html.length < 500) {
      return NextResponse.json({ error: '页面内容过少，可能是登录墙或空页面。' }, { status: 400 });
    }

    const result = parseHtml(html, url);

    if (!result.content || result.content.length < 50) {
      return NextResponse.json({ error: '无法提取正文内容，可能是动态渲染页面或登录墙。' }, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: '抓取超时，请检查链接或稍后重试。' }, { status: 504 });
    }
    console.error('Parse-url error:', error);
    return NextResponse.json({ error: '网页解析失败，请重试。' }, { status: 500 });
  }
}

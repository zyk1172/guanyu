import { timingSafeEqual } from 'node:crypto';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { privacyHmacHash } from './privacy-hash';
import { newsImageUrl } from './news-image-core.mjs';
import { safeOutboundRequest } from './safe-outbound';

type RequestImage = typeof safeOutboundRequest;
type ImageTicket = { article: string; image: string; expires: number };
const HOURS = 6 * 3600_000;
const imageCache = new Map<string, { expires: number; data: Buffer | null }>();
const pending = new Map<string, Promise<Buffer>>();

export function newsImageHref(article: string, image = '', now = Date.now()) {
  const safeArticle = newsImageUrl(article), safeImage = newsImageUrl(image);
  if (!safeArticle) return undefined;
  const payload = Buffer.from(JSON.stringify({ article: safeArticle, image: safeImage, expires: (Math.floor(now / HOURS) + 2) * HOURS })).toString('base64url');
  return `/api/news/image?ticket=${payload}.${privacyHmacHash(`news-image:${payload}`)}`;
}
export function readImageTicket(ticket: string, now = Date.now()): ImageTicket {
  if (ticket.length > 13000) throw new Error('invalid_image_ticket');
  const [payload, signature, extra] = ticket.split('.');
  const expected = privacyHmacHash(`news-image:${payload}`);
  if (!payload || extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('invalid_image_ticket');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ImageTicket;
  if (!Number.isFinite(data.expires) || data.expires <= now || data.expires > now + 2 * HOURS || newsImageUrl(data.article) !== data.article || (data.image && newsImageUrl(data.image) !== data.image)) throw new Error('invalid_image_ticket');
  return data;
}
export function coverFromHtml(html: string, url: string) {
  const $ = cheerio.load(html);
  if ($('#challenge-form, #captcha-form, #cf-challenge-running').length || /^(?:access denied|just a moment|404(?: not found)?|sign in|log in)[.!…]*$/i.test($('title').text().trim())) return [];
  const values: string[] = [];
  $('meta[property="og:image:secure_url"], meta[property="og:image"], meta[name="twitter:image"], meta[name="twitter:image:src"], meta[property="twitter:image"]').each((_, node) => { const image = newsImageUrl($(node).attr('content'), url);if (image) values.push(image); });
  $('script[type="application/ld+json"]').slice(0,6).each((_,node)=>{
    const raw=$(node).text();if(raw.length>100000)return;
    try{
      const data=JSON.parse(raw),objects=Array.isArray(data)?data:[data,...(Array.isArray(data?.['@graph'])?data['@graph']:[])];
      for(const object of objects.slice(0,20))if(/Article|Reportage/.test(String(object?.['@type']||''))){
        for(const image of (Array.isArray(object.image)?object.image:[object.image]).slice(0,3)){
          const candidate=newsImageUrl(typeof image==='string'?image:image?.url||image?.contentUrl,url);if(candidate)values.push(candidate);
        }
      }
    }catch{/* Invalid publisher metadata does not block a text-only card. */}
  });
  $('article img, [itemprop="articleBody"] img, .rm_txt_con img, #rwb_zw img, #articleContent img, .article-content img').slice(0,8).each((_,node)=>{
    const image=newsImageUrl($(node).attr('src')||$(node).attr('data-src'),url);if(image)values.push(image);
  });
  return [...new Set(values)].slice(0, 3);
}
export async function fetchNewsThumbnail(ticket: ImageTicket, options: { request?: RequestImage; now?: number } = {}) {
  const request = options.request || safeOutboundRequest, deadline = Date.now() + 12_000;
  const fetch = async (input: string, isImage: boolean) => {
    let url = input;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const remaining = deadline - Date.now();if (remaining <= 0) throw new Error('image_timeout');
      const response = await request(url, { timeoutMs: Math.min(6000, remaining), maxBytes: isImage ? 2500000 : 1200000, headers: { 'User-Agent': 'Guanyu-News-Preview/1.0', Accept: isImage ? 'image/avif,image/webp,image/png,image/jpeg' : 'text/html,application/xhtml+xml' } });
      if ([301,302,303,307,308].includes(response.status)) {
        const next = newsImageUrl(response.headers.get('location'), url);
        if (!next || redirects === 3) throw new Error('image_redirect');url = next;continue;
      }
      if (response.status !== 200) throw new Error('image_unavailable');
      return { ...response, url };
    }
    throw new Error('image_redirect');
  };
  const resize = async (url: string) => {
    const response = await fetch(url, true);
    if (!/^image\/(?:jpeg|png|webp|avif|gif)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('not_image');
    const bytes=response.body;
    const raster=bytes.subarray(0,3).equals(Buffer.from([255,216,255])) || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || /^GIF8[79]a/.test(bytes.subarray(0,6).toString('ascii')) || (bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP') || (bytes.subarray(4,8).toString('ascii')==='ftyp'&&/avif|avis/.test(bytes.subarray(8,32).toString('ascii')));
    if(!raster)throw new Error('not_raster_image');
    const image = sharp(response.body, { limitInputPixels: 8_000_000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg','png','webp','avif','heif','gif'].includes(metadata.format || '') || (metadata.width || 0) < 80 || (metadata.height || 0) < 50) throw new Error('not_news_image');
    return image.rotate().resize({ width: 640, height: 360, fit: 'cover', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  };
  if (ticket.image) { try { return await resize(ticket.image); } catch { /* Try the same article's declared cover, never an unrelated photo. */ } }
  const response = await fetch(ticket.article, false);
  if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('not_html');
  for (const image of coverFromHtml(response.body.toString('utf8'), response.url).slice(0, 2)) {
    if (image === ticket.image) continue;
    try { return await resize(image); } catch { /* A missing photo is a normal text-only card. */ }
  }
  throw new Error('no_news_image');
}
export async function cachedNewsThumbnail(ticket: ImageTicket) {
  const key = privacyHmacHash(`news-thumb:${ticket.article}:${ticket.image}`), cached = imageCache.get(key);
  if (cached && cached.expires > Date.now()) { if (!cached.data) throw new Error('no_news_image');return cached.data; }
  const current = pending.get(key);if (current) return current;
  if (pending.size >= 6) throw new Error('image_busy');
  const task = fetchNewsThumbnail(ticket).then(data => {
    if (imageCache.size >= 128) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(key, { data, expires: Date.now() + 30 * 60_000 });return data;
  }).catch(error => {
    if (imageCache.size >= 128) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(key, { data: null, expires: Date.now() + 5 * 60_000 });throw error;
  }).finally(() => pending.delete(key));
  pending.set(key, task);return task;
}

import { NextResponse } from 'next/server';
import { requireClientIp, reservePublicUrlParseAttempt } from '@/lib/rate-limit';
import { sameOriginResponse } from '@/lib/request-security';
import { readNewsArticle } from '@/lib/article-extraction';
import { ArticleInputError } from '@/lib/article-input';

export const maxDuration = 30;
export const runtime = 'nodejs';

function parseErrorCode(error: unknown): string {
  if (error instanceof ArticleInputError) return error.code;
  const value = error as { name?: unknown; message?: unknown } | null;
  const name = String(value?.name || '');
  const message = String(value?.message || error || '');
  if (name === 'AbortError' || /超时|timeout|timed out/i.test(message)) return 'UPSTREAM_TIMEOUT';
  if (/频繁|rate limit|too many requests/i.test(message)) return 'RATE_LIMITED';
  if (/内网|localhost|协议|URL 格式|受限制|外部服务地址|private|loopback/i.test(message)) return 'URL_PRIVATE_ADDRESS';
  if (/状态码\s*(401|403)|登录墙|访问被拒|forbidden|unauthorized/i.test(message)) return 'UPSTREAM_FORBIDDEN';
  if (/状态码\s*(404|410)|not found/i.test(message)) return 'UPSTREAM_NOT_FOUND';
  if (/状态码\s*5\d\d|服务器错误|bad gateway|service unavailable/i.test(message)) return 'UPSTREAM_ERROR';
  if (/网络错误|网络连接|failed to fetch|fetch failed|econn|enotfound/i.test(message)) return 'NETWORK_ERROR';
  return 'PARSE_FAILED';
}

function parseErrorResponse(error: unknown, fallback: string, status: number) {
  const message = String((error as { message?: unknown })?.message || fallback);
  return NextResponse.json({ error: message, code: parseErrorCode(error) }, { status });
}

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  try {
    try {
      await reservePublicUrlParseAttempt(requireClientIp(request));
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || '网页解析请求过于频繁，请稍后再试。', code: 'RATE_LIMITED' }, { status: 429 });
    }
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '缺少 URL 参数。', code: 'INVALID_INPUT' }, { status: 400 });
    }

    const result = await readNewsArticle(url);

    return NextResponse.json(result);

  } catch (error: any) {
    if (error instanceof ArticleInputError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error?.name === 'AbortError') {
      return parseErrorResponse({ name: 'AbortError', message: '抓取超时，请检查链接或稍后重试。' }, '抓取超时，请检查链接或稍后重试。', 504);
    }
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message) {
      const code = parseErrorCode(error);
      const status = code === 'URL_PRIVATE_ADDRESS' || code === 'INVALID_URL'
        ? 400
        : code === 'RATE_LIMITED'
          ? 429
          : code === 'UPSTREAM_TIMEOUT'
            ? 504
            : code === 'UPSTREAM_FORBIDDEN'
              ? 403
              : code === 'UPSTREAM_NOT_FOUND'
                ? 404
                : 502;
      return parseErrorResponse(error, message, status);
    }
    console.error('Parse-url error:', error);
    return parseErrorResponse(error, '网页解析失败，请重试。', 500);
  }
}

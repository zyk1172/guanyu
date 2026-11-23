import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { requireClientIp } from '@/lib/rate-limit';
import { sameOriginResponse } from '@/lib/request-security';
import { accessError, AccessError, readAccessJson, reserveAccessAttempt } from '@/lib/access';
import { resolveNewsSearchAccess } from '@/lib/news-search-settings';
import { normalizeNewsQuery } from '@/lib/news-search-core';
import { runNewsSearch } from '@/lib/news-search-service';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const access = await resolveNewsSearchAccess(await getCurrentUser(request));
    return NextResponse.json(access.capabilities, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: '搜索设置暂时无法读取，请刷新后重试。' }, { status: 503 }); }
}
const schema = z.object({ query: z.string().max(512), provider: z.enum(['free', 'deepseek']), period: z.enum(['any', 'day', 'week', 'month']).default('any'), language: z.enum(['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'it-IT']).default('zh-CN') }).strict();
export async function POST(request: Request) {
  try {
    const rejected = sameOriginResponse(request);
    if (rejected) return rejected;
    const input = schema.parse(await readAccessJson(request));
    const query = normalizeNewsQuery(input.query);
    if (!query) throw new AccessError('请输入 2 至 128 个字符的关键词。');
    const user = await getCurrentUser(request);
    let clientIp: string;
    try { clientIp = requireClientIp(request); }
    catch {
      console.error('[news-search] Trusted proxy configuration is required for public request rate limiting.');
      throw new AccessError('新闻搜索服务配置不完整，请联系管理员。', 503);
    }
    await reserveAccessAttempt('news-search-ip', clientIp, user ? 30 : 12, 5 * 60_000);
    const access = await resolveNewsSearchAccess(user);
    const result = await runNewsSearch({ ...input, query }, access, user?.id || null);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const response = accessError(error);
    if (error instanceof AccessError && error.status === 409) response.headers.set('Retry-After', '2');
    return response;
  }
}

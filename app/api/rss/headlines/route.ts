import { NextResponse } from 'next/server';
import { getRssPayload } from '@/lib/rss-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getRssPayload(request), { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch {
    return NextResponse.json({ error: 'RSS 新闻暂时无法加载，请稍后重试。' }, { status: 500 });
  }
}

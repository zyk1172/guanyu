import { after, NextResponse } from 'next/server';
import { getRssContext } from '@/lib/rss-service';
import { FeedRefreshingError, homeNewsCacheKey, homeNewsPayload, readHomeSnapshot, refreshHomeSnapshot } from '@/lib/home-news-service';
import { normalizeReportLanguage } from '@/lib/types';

export const runtime='nodejs';
export const maxDuration=30;
export async function GET(request:Request) {
  try {
    const language=normalizeReportLanguage(new URL(request.url).searchParams.get('locale'));
    const context=await getRssContext(request),key=homeNewsCacheKey(context.sources,language);
    const cached=await readHomeSnapshot(key);
    if(cached) {
      if(cached.stale) after(async()=>{try{await refreshHomeSnapshot(key,context.sources,language);}catch{/* Keep the last successful public-news snapshot. */}});
      return NextResponse.json(homeNewsPayload(cached.data,context.sources,language,cached.stale),{headers:{'Cache-Control':'private, no-store'}});
    }
    return NextResponse.json(homeNewsPayload(await refreshHomeSnapshot(key,context.sources,language),context.sources,language),{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return NextResponse.json({error:error instanceof FeedRefreshingError?'正在同步新闻，请稍候。':'新闻暂时无法读取，请稍后刷新，或使用关键词搜索。'},{status:error instanceof FeedRefreshingError?409:503,headers:{'Cache-Control':'no-store'}});
  }
}

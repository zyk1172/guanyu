import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { handleAnalyze } from '@/lib/analyze-service';
import { sameOriginResponse } from '@/lib/request-security';

export const maxDuration = 300;

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: '请登录后再创建新闻审视。' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  return handleAnalyze(currentUser.id, body, {});
}

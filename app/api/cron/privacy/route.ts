import { NextRequest, NextResponse } from 'next/server';
import { runPrivacyCleanup } from '@/lib/privacy';
import { dispatchAnalyzeJobs } from '@/lib/analyze-job';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: '隐私清理任务未配置。' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: '无权限执行隐私清理任务。' }, { status: 403 });
  }
  try {
    const jobs = await dispatchAnalyzeJobs(10);
    const result = await runPrivacyCleanup();
    return NextResponse.json({ ok: true, result, jobs });
  } catch {
    return NextResponse.json({ error: '隐私清理失败，请稍后重试。' }, { status: 500 });
  }
}

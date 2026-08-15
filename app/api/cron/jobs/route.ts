import { NextRequest, NextResponse } from 'next/server';
import { dispatchAnalyzeJobs } from '@/lib/analyze-job';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: '审视任务调度未配置。' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: '无权限执行审视任务调度。' }, { status: 403 });
  }
  try {
    const result = await dispatchAnalyzeJobs(10);
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ error: '审视任务调度失败，请稍后重试。' }, { status: 500 });
  }
}

import { after, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { createAnalyzeJob, runAnalyzeJob } from '@/lib/analyze-job';

export const maxDuration = 300;

export async function POST(request: Request) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后再创建新闻审视。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  let job;
  try {
    job = await createAnalyzeJob(user.id, {
      title: body.title,
      source: body.source,
      content: body.content,
      focus: body.focus,
    });
  } catch {
    return NextResponse.json({ error: '新闻正文太短，最少需要 50 个字符。' }, { status: 400 });
  }

  after(() => runAnalyzeJob(job.id));

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
  });
}

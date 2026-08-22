import { after, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { createAnalyzeJob, runAnalyzeJob } from '@/lib/analyze-job';
import { normalizeReportLanguage } from '@/lib/types';
import { sameOriginResponse } from '@/lib/request-security';

export const maxDuration = 300;

function reportLanguageFromRequest(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)guanyu-ui-language=([^;]+)/);
  if (!match?.[1]) return undefined;
  try {
    return normalizeReportLanguage(decodeURIComponent(match[1]));
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
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
      sourceUrl: body.sourceUrl,
      reportLanguage: body.reportLanguage || reportLanguageFromRequest(request),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建观隅分析任务失败。' }, { status: 400 });
  }

  after(() => runAnalyzeJob(job.id));

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
  });
}

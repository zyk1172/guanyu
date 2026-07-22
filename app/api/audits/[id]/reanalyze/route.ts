import { after, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAnalyzeJob, runAnalyzeJob } from '@/lib/analyze-job';
import { normalizeReportLanguage } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请登录后重新分析。' }, { status: 401 });

  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    select: {
      userId: true,
      title: true,
      source: true,
      originalContent: true,
      focus: true,
      reportLanguage: true,
    },
  });
  if (!audit) return NextResponse.json({ error: '原报告不存在。' }, { status: 404 });
  if (audit.userId !== user.id) {
    return NextResponse.json({ error: '只有报告创建者可以重新分析。' }, { status: 403 });
  }

  try {
    const job = await createAnalyzeJob(user.id, {
      title: audit.title,
      source: audit.source,
      content: audit.originalContent,
      focus: audit.focus || '',
      reportLanguage: normalizeReportLanguage(audit.reportLanguage),
    });
    after(() => runAnalyzeJob(job.id));
    return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建重新分析任务失败。' }, { status: 400 });
  }
}

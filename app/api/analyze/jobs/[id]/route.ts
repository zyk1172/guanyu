import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { runAnalyzeJob } from '@/lib/analyze-job';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后查看审视任务。' }, { status: 401 });
  }

  const { id } = await params;
  const job = await prisma.auditJob.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      auditId: true,
      error: true,
      nextAttemptAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!job || job.userId !== user.id) {
    return NextResponse.json({ error: '审视任务不存在或无权查看。' }, { status: 404 });
  }

  if (job.status === 'pending' && (!job.nextAttemptAt || job.nextAttemptAt.getTime() <= Date.now())) {
    await runAnalyzeJob(job.id);
  }

  const refreshed = await prisma.auditJob.findUnique({
    where: { id: job.id },
    select: { id: true, status: true, auditId: true, error: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({
    id: refreshed?.id,
    status: refreshed?.status,
    auditId: refreshed?.auditId,
    error: refreshed?.error,
    createdAt: refreshed?.createdAt,
    updatedAt: refreshed?.updatedAt,
  });
}

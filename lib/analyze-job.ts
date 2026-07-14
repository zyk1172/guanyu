import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { releaseAnalyzeJobAdmission, reserveAnalyzeJobAdmission } from '@/lib/rate-limit';
import { POST as analyzeNews } from '@/app/api/analyze/route';
import { notifyReportCompleted } from '@/lib/email';
import { normalizeReportLanguage, type ReportLanguage } from '@/lib/types';

const MAX_NEWS_CONTENT_LENGTH = 30_000;

export type AnalyzeJobInput = {
  title: string;
  source: string;
  content: string;
  focus?: string;
  reportLanguage?: ReportLanguage;
};

export function normalizeAnalyzeJobInput(input: Partial<AnalyzeJobInput>) {
  return {
    title: String(input.title || '').trim().slice(0, 180),
    source: String(input.source || '').trim().slice(0, 180),
    content: String(input.content || '').trim().slice(0, MAX_NEWS_CONTENT_LENGTH),
    focus: String(input.focus || '').trim().slice(0, 1000),
    ...(typeof input.reportLanguage === 'string'
      ? { reportLanguage: normalizeReportLanguage(input.reportLanguage) }
      : {}),
    mode: 'deep',
  };
}

export async function createAnalyzeJob(userId: string, input: Partial<AnalyzeJobInput>) {
  await ensureRuntimeSchema();
  const normalizedInput = normalizeAnalyzeJobInput(input);
  if (normalizedInput.content.length < 50) {
    throw new Error('新闻正文太短，最少需要 50 个字符。');
  }

  const admission = await reserveAnalyzeJobAdmission(userId);
  try {
    return await prisma.auditJob.create({
      data: {
        userId,
        status: 'pending',
        inputJson: JSON.stringify({ ...normalizedInput, admissionEventId: admission.id }),
      },
    });
  } catch (error) {
    await releaseAnalyzeJobAdmission(userId, admission.id);
    throw error;
  }
}

export async function runAnalyzeJob(jobId: string) {
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;
  if (!internalSecret) {
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: '服务端内部审视通道未配置，请联系管理员。' },
    });
    return;
  }

  const claim = await prisma.auditJob.updateMany({
    where: { id: jobId, status: 'pending' },
    data: { status: 'running', error: null },
  });
  if (claim.count !== 1) return;

  const job = await prisma.auditJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const storedInput = JSON.parse(job.inputJson);
    const { admissionEventId, ...input } = storedInput;
    const analyzeRequest = new Request('https://guanyu.internal/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guanyu-internal-auth': internalSecret,
        'x-guanyu-internal-user-id': job.userId,
        'x-guanyu-force-save': 'true',
      },
      body: JSON.stringify(input),
    });

    const response = await analyzeNews(analyzeRequest);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      await releaseAnalyzeJobAdmission(job.userId, admissionEventId);
      await prisma.auditJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: data.error || `审视生成失败 (${response.status})` },
      });
      return;
    }

    await prisma.auditJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        auditId: data.auditId || '',
        error: null,
      },
    });

    if (data.auditId) {
      const audit = await prisma.audit.findUnique({
        where: { id: data.auditId },
        select: {
          id: true,
          userId: true,
          title: true,
          source: true,
          reportLanguage: true,
          modelName: true,
          reasoningDepth: true,
          createdAt: true,
          auditResultJson: true,
          user: { select: { id: true, email: true } },
        },
      });
      if (audit) {
        let report: unknown = {};
        try {
          report = JSON.parse(audit.auditResultJson);
        } catch {
          report = {};
        }
        await notifyReportCompleted({
          userEmail: audit.user.email,
          audit,
          report,
        });
      }
    }
  } catch (error: any) {
    try {
      const storedInput = JSON.parse(job.inputJson);
      await releaseAnalyzeJobAdmission(job.userId, storedInput.admissionEventId);
    } catch {}
    await prisma.auditJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: error?.message || '审视任务执行失败。' },
    });
  }
}

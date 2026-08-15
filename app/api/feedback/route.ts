import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { notifyAdminsFeedback } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { reserveFeedbackAttempt } from '@/lib/rate-limit';
import { toClientError } from '@/lib/app-error';

const FEEDBACK_TYPES = new Set(['bug', 'feature', 'report', 'billing', 'other']);

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  bug: '功能异常',
  feature: '功能建议',
  report: '报告内容',
  billing: '订单与点数',
  other: '其他反馈',
};

export async function POST(request: Request) {
  try {
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再提交反馈。' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const type = String(body.type || 'other').trim();
    const message = String(body.message || '').trim();
    if (!FEEDBACK_TYPES.has(type)) {
      return NextResponse.json({ error: '反馈类型无效。' }, { status: 400 });
    }
    if (message.length < 5) {
      return NextResponse.json({ error: '请至少填写 5 个字符的反馈内容。' }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: '反馈内容不能超过 4000 个字符。' }, { status: 400 });
    }

    await reserveFeedbackAttempt(user.id);
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, name: true },
    });
    const result = await notifyAdminsFeedback({
      userId: user.id,
      userEmail: account?.email || user.email,
      userName: account?.name,
      category: FEEDBACK_TYPE_LABELS[type],
      message,
      submittedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      message: result.delivered
        ? '反馈已提交，已通过邮件通知超级管理员。'
        : '反馈已记录，但管理员邮件暂未投递成功，请稍后重试。',
    });
  } catch (error) {
    console.error('feedback submission failed', { code: 'feedback_submission_failed' });
    const clientError = toClientError(error);
    return NextResponse.json({ error: clientError.message }, { status: clientError.status });
  }
}

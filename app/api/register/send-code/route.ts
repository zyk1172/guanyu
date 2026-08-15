import { NextRequest, NextResponse } from 'next/server';
import { createEmailVerificationCode, verifyCaptcha } from '@/lib/captcha';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { sendRegisterCodeEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    await ensureRuntimeSchema();
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const captchaId = String(body.captchaId || '');
    const captchaAnswer = String(body.captchaAnswer || '');

    if (!email) {
      return NextResponse.json({ error: '请输入邮箱地址。' }, { status: 400 });
    }
    if (!captchaId || !captchaAnswer) {
      return NextResponse.json({ error: '请先完成图形验证码。' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const captchaOk = await verifyCaptcha(captchaId, captchaAnswer, ip);
    if (!captchaOk) {
      return NextResponse.json({ error: '图形验证码错误或已过期，请刷新后重试。' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({
        ok: true,
        message: process.env.NODE_ENV === 'production'
          ? '如果该邮箱可用于注册，验证码将在几分钟内发送。'
          : '该邮箱已注册；为保持接口一致，开发环境也不再返回注册状态差异。',
      });
    }

    const code = await createEmailVerificationCode(email, ip);
    await sendRegisterCodeEmail(email, code);

    return NextResponse.json({
      ok: true,
      message: process.env.NODE_ENV === 'production'
        ? '邮箱验证码已发送，请查收。'
        : `开发环境验证码：${code}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '发送邮箱验证码失败，请稍后重试。' }, { status: 500 });
  }
}

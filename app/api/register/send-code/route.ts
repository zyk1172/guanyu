import { AccessError, reserveAccessAttempt } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { sendLegacyVerificationCode, verifyCaptcha } from '@/lib/captcha';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { sendRegisterCodeEmail } from '@/lib/email';
import { sameOriginResponse } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  try {
    const originError = sameOriginResponse(request);
    if (originError) return originError;
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

    await reserveAccessAttempt('legacy-email-code', ip, 5);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ ok: true, message: '如果该邮箱可用于注册，验证码将在几分钟内发送。' });
    }

    await sendLegacyVerificationCode(email, ip, 'register_email', sendRegisterCodeEmail);

    return NextResponse.json({ ok: true, message: '如果该邮箱可用于注册，验证码将在几分钟内发送。' });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[legacy-email-code] request failed');
    return NextResponse.json({ error: '验证码请求暂时无法处理，请稍后重试。' }, { status: 500 });
  }
}

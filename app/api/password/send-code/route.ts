import { AccessError, reserveAccessAttempt } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { sendLegacyVerificationCode, verifyCaptcha } from '@/lib/captcha';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { sendPasswordResetCodeEmail } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';

const SUCCESS_MESSAGE = '如果该邮箱已注册，密码重置验证码会在几分钟内发送，请查收邮件。';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    await ensureRuntimeSchema();
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const captchaId = String(body.captchaId || '');
    const captchaAnswer = String(body.captchaAnswer || '');
    if (!email || !captchaId || !captchaAnswer) {
      return NextResponse.json({ error: '请填写邮箱并完成图形验证码。' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const captchaOk = await verifyCaptcha(captchaId, captchaAnswer, ip);
    if (!captchaOk) {
      return NextResponse.json({ error: '图形验证码错误或已过期，请刷新后重试。' }, { status: 400 });
    }
    await reserveAccessAttempt('legacy-email-code', ip, 5);
    const account = await prisma.user.findUnique({ where: { email }, select: { email: true, isBanned: true } });
    if (account && !account.isBanned) {
      await sendLegacyVerificationCode(email, ip, 'password_reset', sendPasswordResetCodeEmail);
    }
    return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[legacy-email-code] request failed');
    return NextResponse.json({ error: '验证码请求暂时无法处理，请稍后重试。' }, { status: 500 });
  }
}

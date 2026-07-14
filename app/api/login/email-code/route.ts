import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailCode } from '@/lib/captcha';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';
import { setSessionCookie } from '@/lib/session-cookie';

const INVALID_LOGIN_CODE = '邮箱验证码错误、已过期，或账号暂不可用。';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    await ensureRuntimeSchema();
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    if (!email || !code) {
      return NextResponse.json({ error: '请输入邮箱和验证码。' }, { status: 400 });
    }
    const account = await prisma.user.findUnique({ where: { email } });
    if (!account || account.isBanned) {
      return NextResponse.json({ error: INVALID_LOGIN_CODE }, { status: 401 });
    }
    const verified = await verifyEmailCode(email, code, 'login_email');
    if (!verified) {
      return NextResponse.json({ error: INVALID_LOGIN_CODE }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, url: '/' });
    await setSessionCookie(response, account);
    return response;
  } catch {
    return NextResponse.json({ error: '邮箱验证码登录失败，请稍后重试。' }, { status: 500 });
  }
}

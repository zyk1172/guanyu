import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailCode } from '@/lib/captcha';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { notifyPasswordChanged } from '@/lib/email';
import { assertValidPasswordInput, hashPassword } from '@/lib/password-core.mjs';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';
import { setSessionCookie } from '@/lib/session-cookie';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    await ensureRuntimeSchema();
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');
    if (!email || !code || !password || !confirmPassword) {
      return NextResponse.json({ error: '请完整填写邮箱、验证码和新密码。' }, { status: 400 });
    }
    try {
      assertValidPasswordInput(password);
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || '密码长度不符合要求。' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: '两次输入的密码不一致。' }, { status: 400 });
    }
    const account = await prisma.user.findUnique({ where: { email } });
    if (!account || account.isBanned) {
      return NextResponse.json({ error: '验证码错误、已过期，或账号暂不可用。' }, { status: 400 });
    }
    const verified = await verifyEmailCode(email, code, 'password_reset');
    if (!verified) {
      return NextResponse.json({ error: '验证码错误、已过期，或已被使用。' }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: account.id },
        data: {
          password: await hashPassword(password),
          sessionVersion: { increment: 1 },
        },
      });
      await tx.extensionSession.updateMany({
        where: { userId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return nextUser;
    });
    notifyPasswordChanged({ userId: updated.id, email: updated.email }).catch((error) => {
      console.error('password reset notification failed', error);
    });
    const response = NextResponse.json({ ok: true, url: '/account' });
    await setSessionCookie(response, updated);
    return response;
  } catch {
    return NextResponse.json({ error: '密码重置失败，请稍后重试。' }, { status: 500 });
  }
}

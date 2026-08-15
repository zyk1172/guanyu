import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { notifyPasswordChanged } from '@/lib/email';
import { hashPassword, verifyPassword } from '@/lib/password-core.mjs';
import { prisma } from '@/lib/prisma';
import { reservePasswordChangeAttempt } from '@/lib/rate-limit';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请登录后再修改密码。' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');
    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: '请完整填写当前密码和新密码。' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: '新密码至少需要 8 个字符。' }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: '两次输入的新密码不一致。' }, { status: 400 });
    }
    await reservePasswordChangeAttempt(user.id);
    const account = await prisma.user.findUnique({ where: { id: user.id } });
    if (!account || !verifyPassword(currentPassword, account.password).valid) {
      return NextResponse.json({ error: '当前密码不正确。' }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashPassword(newPassword),
        sessionVersion: { increment: 1 },
      },
    });
    notifyPasswordChanged({ userId: account.id, email: account.email }).catch((error) => {
      console.error('password change notification failed', error);
    });
    return NextResponse.json({ ok: true, message: '密码已修改。我们已向你的邮箱发送安全通知。' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '密码修改失败，请稍后重试。' }, { status: 500 });
  }
}

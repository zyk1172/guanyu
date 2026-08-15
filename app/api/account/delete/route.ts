import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password-core.mjs';
import { verifyEmailCode } from '@/lib/captcha';
import { deleteUserAccount } from '@/lib/privacy';
import { cacheDelByPrefix, CACHE_KEYS } from '@/lib/cache';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const password = String(body.password || '');
    const emailCode = String(body.emailCode || '').trim();
    const confirmation = String(body.confirmation || '').trim();
    if (!password && !emailCode && !confirmation) {
      return NextResponse.json({ error: '删除账号需要输入当前密码或邮箱验证码。' }, { status: 400 });
    }

    const account = await prisma.user.findUnique({ where: { id: user.id } });
    if (!account) return NextResponse.json({ error: '账号不存在。' }, { status: 404 });

    const candidate = confirmation || password;
    const confirmed = emailCode
      ? await verifyEmailCode(account.email, emailCode, 'login_email')
      : (verifyPassword(candidate, account.password).valid || await verifyEmailCode(account.email, candidate, 'login_email'));
    if (!confirmed) {
      return NextResponse.json({ error: '当前密码或邮箱验证码不正确。' }, { status: 400 });
    }

    await deleteUserAccount(account.id, account.email);
    await Promise.all([
      cacheDelByPrefix(CACHE_KEYS.hotAuditsPrefix),
      cacheDelByPrefix('guanyu:cache:audit:'),
    ]).catch(() => {});
    return NextResponse.json({ ok: true, message: '账号及相关数据已删除。' });
  } catch {
    return NextResponse.json({ error: '删除账号失败，请稍后重试。' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session-cookie';
import { clearLoginAttempts, reserveLoginAttempt } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/request-security';

async function readCredentials(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    return {
      email: String(body.email || '').trim().toLowerCase(),
      password: String(body.password || ''),
      wantsJson: true,
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get('email') || '').trim().toLowerCase(),
    password: String(formData.get('password') || ''),
    wantsJson: false,
  };
}

function errorResponse(message: string, wantsJson: boolean, status = 400) {
  if (wantsJson) {
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(message)}`, process.env.NEXTAUTH_URL || 'http://localhost:3000'),
    303
  );
}

export async function POST(request: NextRequest) {
  try {
    try {
      assertSameOrigin(request);
    } catch (error: any) {
      return errorResponse(error?.message || '跨站请求已被拒绝。', request.headers.get('content-type')?.includes('application/json') ?? false, 403);
    }
    const { email, password, wantsJson } = await readCredentials(request);

    if (!email || !password) {
      return errorResponse('请输入邮箱和密码', wantsJson);
    }

    try {
      await reserveLoginAttempt(email);
    } catch (error: any) {
      return errorResponse(error?.message || '登录尝试过于频繁，请稍后再试。', wantsJson, 429);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return errorResponse('账号不存在，请先注册。', wantsJson, 401);
    }

    if (user.isBanned) {
      return errorResponse('账号已被管理员暂停使用，请联系管理员。', wantsJson, 403);
    }

    const passwordResult = verifyPassword(password, user.password);
    if (!passwordResult.valid) {
      return errorResponse('密码错误', wantsJson, 401);
    }

    if (passwordResult.needsUpgrade) {
      await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(password) } });
    }
    await clearLoginAttempts(email);

    const response = wantsJson
      ? NextResponse.json({ ok: true, url: '/' })
      : NextResponse.redirect(new URL('/', process.env.NEXTAUTH_URL || 'http://localhost:3000'), 303);
    await setSessionCookie(response, user);
    return response;
  } catch {
    return NextResponse.json({ error: '登录失败，请稍后重试。' }, { status: 500 });
  }
}

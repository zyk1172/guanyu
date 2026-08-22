import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertValidPasswordInput, hashPassword } from '@/lib/password-core.mjs';
import { setSessionCookie } from '@/lib/session-cookie';
import { verifyEmailCodeTx } from '@/lib/captcha';
import { sendWelcomeEmail } from '@/lib/email';
import { grantSignupBonusTx } from '@/lib/billing';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';

async function readRegistration(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    return {
      email: String(body.email || '').trim().toLowerCase(),
      password: String(body.password || ''),
      confirmPassword: String(body.confirmPassword || ''),
      emailCode: String(body.emailCode || '').trim(),
      wantsJson: true,
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get('email') || '').trim().toLowerCase(),
    password: String(formData.get('password') || ''),
    confirmPassword: String(formData.get('confirmPassword') || ''),
    emailCode: String(formData.get('emailCode') || '').trim(),
    wantsJson: false,
  };
}

function errorResponse(message: string, wantsJson: boolean, status = 400) {
  if (wantsJson) {
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.redirect(
    new URL(`/register?error=${encodeURIComponent(message)}`, process.env.NEXTAUTH_URL || 'http://localhost:3000'),
    303
  );
}

export async function POST(request: NextRequest) {
  let wantsJson = request.headers.get('content-type')?.includes('application/json') ?? false;
  try {
    const registration = await readRegistration(request);
    const { email, password, confirmPassword, emailCode } = registration;
    wantsJson = registration.wantsJson;
    try {
      assertSameOrigin(request);
      assertSecureAccountTransport(request);
    } catch (error: any) {
      return errorResponse(error?.message || '跨站请求已被拒绝。', wantsJson, 403);
    }

    if (!email || !password) {
      return errorResponse('请输入邮箱和密码', wantsJson);
    }
    try {
      assertValidPasswordInput(password);
    } catch (error: any) {
      return errorResponse(error?.message || '密码长度不符合要求。', wantsJson);
    }
    if (password !== confirmPassword) {
      return errorResponse('两次输入的密码不一致', wantsJson);
    }
    if (!emailCode) {
      return errorResponse('请输入邮箱验证码', wantsJson);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return errorResponse('注册信息无法完成，请重新尝试或直接登录。', wantsJson, 400);
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const emailCodeOk = await verifyEmailCodeTx(tx, email, emailCode, 'register_email');
      if (!emailCodeOk) return null;

      const created = await tx.user.create({
        data: {
          email,
          password: passwordHash,
          role: 'user',
          settings: {
            create: {
              defaultModelName: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
              llmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
              defaultReasoningDepth: 'medium',
              defaultIsPublic: false,
              defaultEnableCharts: true,
            },
          },
        },
      });
      await grantSignupBonusTx(tx, created.id);
      return created;
    });

    if (!user) {
      return errorResponse('邮箱验证码错误或已过期，请重新获取。', wantsJson, 400);
    }

    const response = wantsJson
      ? NextResponse.json({ ok: true, url: '/account' })
      : NextResponse.redirect(new URL('/account', process.env.NEXTAUTH_URL || 'http://localhost:3000'), 303);
    await setSessionCookie(response, user);
    sendWelcomeEmail(user.email).catch((error) => {
      console.error('Send welcome email failed:', error);
    });
    return response;
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse('注册信息无法完成，请重新尝试或直接登录。', wantsJson, 400);
    }
    console.error('Registration failed:', error instanceof Error ? error.message : 'unknown error');
    return errorResponse('注册失败，请稍后重试。', wantsJson, 500);
  }
}

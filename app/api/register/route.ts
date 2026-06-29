import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session-cookie';

async function readRegistration(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    return {
      email: String(body.email || '').trim().toLowerCase(),
      password: String(body.password || ''),
      confirmPassword: String(body.confirmPassword || ''),
      wantsJson: true,
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get('email') || '').trim().toLowerCase(),
    password: String(formData.get('password') || ''),
    confirmPassword: String(formData.get('confirmPassword') || ''),
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
  try {
    const { email, password, confirmPassword, wantsJson } = await readRegistration(request);

    if (!email || !password) {
      return errorResponse('请输入邮箱和密码', wantsJson);
    }
    if (password.length < 6) {
      return errorResponse('密码至少需要 6 个字符', wantsJson);
    }
    if (password !== confirmPassword) {
      return errorResponse('两次输入的密码不一致', wantsJson);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return errorResponse('该邮箱已经注册，请直接登录。', wantsJson, 409);
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: hashPassword(password),
        settings: {
          create: {
            defaultModelName: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
            llmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            defaultReasoningDepth: 'medium',
            defaultAnalysisMode: 'quick',
            defaultIsPublic: true,
            defaultSaveResult: true,
            defaultEnableCharts: true,
          },
        },
      },
    });

    const response = wantsJson
      ? NextResponse.json({ ok: true, url: '/account' })
      : NextResponse.redirect(new URL('/account', process.env.NEXTAUTH_URL || 'http://localhost:3000'), 303);
    await setSessionCookie(response, user);
    return response;
  } catch {
    return NextResponse.json({ error: '注册失败，请稍后重试。' }, { status: 500 });
  }
}

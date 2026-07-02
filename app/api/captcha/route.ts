import { NextResponse } from 'next/server';
import { createCaptchaChallenge } from '@/lib/captcha';
import { getClientIp } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    const challenge = await createCaptchaChallenge(getClientIp(request));
    return NextResponse.json(challenge);
  } catch {
    return NextResponse.json({ error: '生成图形验证码失败，请稍后重试。' }, { status: 500 });
  }
}


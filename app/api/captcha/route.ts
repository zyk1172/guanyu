import { NextResponse } from 'next/server';
import { createCaptchaChallenge } from '@/lib/captcha';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { getClientIp } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    await ensureRuntimeSchema();
    const challenge = await createCaptchaChallenge(getClientIp(request));
    return NextResponse.json(challenge);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成图形验证码失败，请稍后重试。';
    const rateLimited = message.includes('过于频繁');
    return NextResponse.json({ error: rateLimited ? message : '生成图形验证码失败，请稍后重试。' }, { status: rateLimited ? 429 : 500 });
  }
}

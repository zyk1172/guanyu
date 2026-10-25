import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createEmailVerificationCode } from '@/lib/captcha';
import { sendTrackedEmail } from '@/lib/email';
import { requireClientIp } from '@/lib/rate-limit';
import { AccessError, accessError, emailSchema, guardAccountRequest, readAccessJson, requireAccount, reserveAccessAttempt } from '@/lib/access';

const inputSchema = z.object({ email: emailSchema.optional(), purpose: z.enum(['access', 'current-email', 'new-email']).default('access') });
export async function POST(request: Request) {
  try {
    guardAccountRequest(request);
    const input = inputSchema.parse(await readAccessJson(request));
    const ip = requireClientIp(request);
    await reserveAccessAttempt('send-code', ip, 5);
    const user = input.purpose === 'access' ? null : await requireAccount(request);
    const email = input.purpose === 'current-email' ? user!.email! : input.email;
    if (!email) throw new AccessError('请填写邮箱。');
    const key = input.purpose === 'new-email' ? `${user!.id}:${email}` : email;
    const purpose = input.purpose === 'access' ? 'access_email' : input.purpose === 'current-email' ? 'login_email' : 'change_email';
    const code = await createEmailVerificationCode(key, ip, purpose);
    const delivery = await sendTrackedEmail({
      category: 'access_code', to: email,
      subject: input.purpose === 'access' ? '观隅登录 / 注册验证码' : '观隅账号安全验证码',
      text: `你的验证码是 ${code}，10 分钟内有效。请勿提供给他人。${input.purpose === 'access' ? '首次验证后将自动创建账号。' : '如果不是你本人操作，请忽略此邮件。'}`,
      html: `<p>你的观隅验证码是：</p><p style="font-size:28px;letter-spacing:6px"><strong>${code}</strong></p><p>10 分钟内有效，请勿提供给他人。如果不是你本人操作，请忽略此邮件。</p>`,
    });
    if (!delivery.delivered && process.env.NODE_ENV === 'production') throw new AccessError('邮件暂未送达，请稍后重试或使用其他登录方式。', 503);
    return NextResponse.json({ ok: true, message: '验证码已发送，10 分钟内有效。' });
  } catch (error) { return accessError(error); }
}

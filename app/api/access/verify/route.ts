import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyEmailCodeTx } from '@/lib/captcha';
import { grantSignupBonusTx } from '@/lib/billing';
import { setSessionCookie } from '@/lib/session-cookie';
import { requireClientIp } from '@/lib/rate-limit';
import { AccessError, accessError, emailSchema, guardAccountRequest, readAccessJson, reserveAccessAttempt } from '@/lib/access';

const schema = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) });
export async function POST(request: Request) {
  try {
    guardAccountRequest(request);
    const { email, code } = schema.parse(await readAccessJson(request));
    await reserveAccessAttempt('verify-code', requireClientIp(request), 20);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-email:${email}`}))`;
      if (!await verifyEmailCodeTx(tx, email, code, 'access_email')) return null;
      let user = await tx.user.findUnique({ where: { email } });
      if (user?.isBanned) return null;
      const isNew = !user;
      if (!user) {
        user = await tx.user.create({ data: { email, password: '!passwordless', settings: { create: {} } } });
        await grantSignupBonusTx(tx, user.id);
      }
      return { user, isNew };
    });
    if (!result) throw new AccessError('验证码错误、已过期，或账号暂不可用。', 401);
    const response = NextResponse.json({ ok: true, url: result.isNew ? '/account?setup=passkey' : '/' });
    await setSessionCookie(response, result.user);
    return response;
  } catch (error) { return accessError(error); }
}

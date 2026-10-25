import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyEmailCodeTx } from '@/lib/captcha';
import { setSessionCookie } from '@/lib/session-cookie';
import { sendTrackedEmail } from '@/lib/email';
import { AccessError, accessError, emailSchema, guardAccountRequest, readAccessJson, requireAccount, requireRecentAuth, reserveAccessAttempt } from '@/lib/access';

const schema = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/), password: z.string().max(1024).optional(), emailCode: z.string().max(6).optional() });
export async function PATCH(request: Request) {
  try {
    guardAccountRequest(request);
    const user = await requireAccount(request);
    await reserveAccessAttempt('change-email', user.id, 10);
    const input = schema.parse(await readAccessJson(request));
    if (input.email === user.email) throw new AccessError('请填写新的邮箱。');
    await requireRecentAuth(user, input);
    const updated = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const account = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (account.isBanned || account.sessionVersion !== user.sessionVersion || account.email !== user.email) throw new AccessError('会话已变更，请重新登录。', 401);
      if (!await verifyEmailCodeTx(tx, `${user.id}:${input.email}`, input.code, 'change_email')) return null;
      if (await tx.user.findUnique({ where: { email: input.email } })) return false;
      const result = await tx.user.update({ where: { id: user.id }, data: { email: input.email, sessionVersion: { increment: 1 } } });
      await tx.extensionSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return result;
    });
    if (updated === null) throw new AccessError('新邮箱验证码错误或已过期。');
    if (updated === false) throw new AccessError('该邮箱暂时无法使用，请更换邮箱。');
    const response = NextResponse.json({ ok: true, email: updated.email });
    await setSessionCookie(response, updated);
    void sendTrackedEmail({ category: 'security_notice', to: user.email!, subject: '观隅账号邮箱已修改', text: '你的观隅账号邮箱已修改。其他设备已退出登录。若不是你本人操作，请立即联系管理员。', html: '<p>你的观隅账号邮箱已修改，其他设备已退出登录。若不是你本人操作，请立即联系管理员。</p>' }).catch(() => {});
    return response;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return accessError(new AccessError('该邮箱暂时无法使用，请更换邮箱。'));
    return accessError(error);
  }
}

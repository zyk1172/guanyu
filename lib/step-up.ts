import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password-core.mjs';
import { verifyEmailCode } from '@/lib/captcha';

export async function verifyStepUp(userId: string, input: { password?: string; emailCode?: string }) {
  const account = await prisma.user.findUnique({ where: { id: userId } });
  if (!account) throw new Error('账号不存在。');
  const password = String(input.password || '').trim();
  const emailCode = String(input.emailCode || '').trim();
  if (password && (await verifyPassword(password, account.password)).valid) return true;
  if (emailCode && await verifyEmailCode(account.email, emailCode, 'login_email')) return true;
  return false;
}

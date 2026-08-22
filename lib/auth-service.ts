import { prisma } from '@/lib/prisma';
import { clearLoginAttempts, reserveLoginAttempt } from '@/lib/rate-limit';
import { hashPassword, verifyPassword } from '@/lib/password-core.mjs';

const INVALID_CREDENTIALS_ERROR = '邮箱或密码不正确，或账号暂不可用。';

export async function authenticatePassword(email: string, password: string, ip?: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error('请输入邮箱和密码');
  }

  await reserveLoginAttempt(normalizedEmail, ip);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      password: true,
      isBanned: true,
      sessionVersion: true,
    },
  });

  if (!user || user.isBanned) {
    throw new Error(INVALID_CREDENTIALS_ERROR);
  }

  const passwordResult = await verifyPassword(password, user.password);
  if (!passwordResult.valid) {
    throw new Error(INVALID_CREDENTIALS_ERROR);
  }

  if (passwordResult.needsUpgrade) {
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(password) },
    });
  }
  await clearLoginAttempts(normalizedEmail);

  return {
    id: user.id,
    email: user.email,
    sessionVersion: user.sessionVersion,
  };
}

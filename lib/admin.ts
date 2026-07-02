import { prisma } from '@/lib/prisma';
import { isSuperAdminIdentity } from './admin-core.mjs';

export async function getSuperAdminStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  return isSuperAdminIdentity(user, {
    SUPER_ADMIN_EMAILS: process.env.SUPER_ADMIN_EMAILS,
    SUPER_ADMIN_IDS: process.env.SUPER_ADMIN_IDS,
  });
}

import { prisma } from '@/lib/prisma';

export async function getSuperAdminStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
    },
  });

  return user?.role === 'super_admin';
}

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function requirePageAccount() {
  const request = new NextRequest(process.env.NEXTAUTH_URL || 'http://localhost:3000', { headers: await headers() });
  const user = await getCurrentUser(request);
  if (!user) redirect('/login');
  return { user, isSuperAdmin: user.role === 'super_admin' };
}

export async function requireAdminPage() {
  const account = await requirePageAccount();
  if (!account.isSuperAdmin) notFound();
  return account;
}

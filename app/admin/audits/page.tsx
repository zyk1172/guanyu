import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import AuditManagementList from '@/components/AuditManagementList';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';

export default async function SiteAuditsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const request = new Request(process.env.NEXTAUTH_URL || 'http://localhost:3000', { headers: await headers() });
  const user = await getCurrentUser(request);
  if (!user) redirect('/login');
  if (!await getSuperAdminStatus(user.id)) notFound();
  const { search } = await searchParams;
  return <AuditManagementList scope="site" initialSearch={typeof search === 'string' ? search : ''} />;
}

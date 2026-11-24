import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import AuditManagementList from '@/components/AuditManagementList';
import { getCurrentUser } from '@/lib/auth';

export default async function MyAuditsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const request = new NextRequest(process.env.NEXTAUTH_URL || 'http://localhost:3000', { headers: await headers() });
  if (!await getCurrentUser(request)) redirect('/login');
  const { search } = await searchParams;
  return <AuditManagementList scope="own" initialSearch={typeof search === 'string' ? search : ''} />;
}

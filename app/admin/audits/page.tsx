import { requireAdminPage } from '@/lib/page-auth';
import AuditManagementList from '@/components/AuditManagementList';

export default async function SiteAuditsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  await requireAdminPage();
  const { search } = await searchParams;
  return <AuditManagementList scope="site" initialSearch={typeof search === 'string' ? search : ''} />;
}

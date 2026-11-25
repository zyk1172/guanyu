import { requireAdminPage } from '@/lib/page-auth';
import { notFound } from 'next/navigation';
import NewsSearchAdmin from '@/components/NewsSearchAdmin';
import PlatformModelAdmin from '@/components/PlatformModelAdmin';
import TrafficAdmin from '@/components/TrafficAdmin';
import AdminSectionFrame from '@/components/AdminSectionFrame';

const sections = {
  models: PlatformModelAdmin,
  search: NewsSearchAdmin,
  traffic: TrafficAdmin,
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section !== 'models' && section !== 'search' && section !== 'traffic') notFound();
  await requireAdminPage();
  const Content = sections[section];
  return <AdminSectionFrame section={section}>
    <Content />
  </AdminSectionFrame>;
}

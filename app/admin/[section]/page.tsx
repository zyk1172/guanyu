import { requireAdminPage } from '@/lib/page-auth';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import NewsSearchAdmin from '@/components/NewsSearchAdmin';
import PlatformModelAdmin from '@/components/PlatformModelAdmin';
import TrafficAdmin from '@/components/TrafficAdmin';
import AdminBackLink from '@/components/AdminBackLink';

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
  return <main className="workspace-page pb-12">
    <Header />
    <div id="main-content" tabIndex={-1} className="workspace-container workspace-content space-y-4">
      <AdminBackLink />
      <Content />
    </div>
  </main>;
}

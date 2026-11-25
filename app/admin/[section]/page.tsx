import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import NewsSearchAdmin from '@/components/NewsSearchAdmin';
import PlatformModelAdmin from '@/components/PlatformModelAdmin';
import TrafficAdmin from '@/components/TrafficAdmin';
import { ButtonLink } from '@/components/ui/controls';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';

const sections = {
  models: PlatformModelAdmin,
  search: NewsSearchAdmin,
  traffic: TrafficAdmin,
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section !== 'models' && section !== 'search' && section !== 'traffic') notFound();
  const request = new NextRequest(process.env.NEXTAUTH_URL || 'http://localhost:3000', { headers: await headers() });
  const user = await getCurrentUser(request);
  if (!user) redirect('/login');
  if (!await getSuperAdminStatus(user.id)) notFound();
  const Content = sections[section];
  return <main className="workspace-page pb-12">
    <Header />
    <div id="main-content" tabIndex={-1} className="workspace-container workspace-content space-y-4">
      <ButtonLink href="/account">账户管理</ButtonLink>
      <Content />
    </div>
  </main>;
}

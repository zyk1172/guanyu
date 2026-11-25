import AccountWorkspace from '@/app/account/AccountWorkspace';
import { requireAdminPage } from '@/lib/page-auth';

export default async function AdminPage() {
  const { user, isSuperAdmin } = await requireAdminPage();
  return <AccountWorkspace key={user.id} account={{ id: user.id, email: user.email }} isSuperAdmin={isSuperAdmin} view="system" />;
}

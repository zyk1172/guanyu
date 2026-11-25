import AccountWorkspace from './AccountWorkspace';
import { requirePageAccount } from '@/lib/page-auth';

export default async function AccountPage() {
  const { user, isSuperAdmin } = await requirePageAccount();
  return <AccountWorkspace key={user.id} account={{ id: user.id, email: user.email }} isSuperAdmin={isSuperAdmin} />;
}

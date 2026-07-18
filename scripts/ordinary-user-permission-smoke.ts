import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());

  const email = String(process.env.TEST_USER_EMAIL || '').trim().toLowerCase();
  const internalSecret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;

  if (!email) throw new Error('Set TEST_USER_EMAIL to the ordinary account being checked.');
  if (!internalSecret) throw new Error('INTERNAL_API_SECRET or NEXTAUTH_SECRET is required.');

  const [{ prisma }, { getSuperAdminStatus }, billingAdmin, auditsAdmin, operationsBackup, billingStatus, myAudits] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/admin'),
    import('../app/api/billing/admin/route'),
    import('../app/api/audits/admin/route'),
    import('../app/api/admin/backup/route'),
    import('../app/api/billing/status/route'),
    import('../app/api/audits/my/route'),
  ]);

  const account = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isBanned: true },
  });

  if (!account) throw new Error('The requested ordinary test account does not exist.');
  if (account.isBanned) throw new Error('The requested ordinary test account is banned.');
  if (await getSuperAdminStatus(account.id)) throw new Error('SECURITY FAILURE: the test account resolves as a super administrator.');

  const authenticatedRequest = (path: string) => new Request(`http://localhost${path}`, {
    headers: {
      'x-guanyu-internal-user-id': account.id,
      'x-guanyu-internal-auth': internalSecret,
    },
  });

  const checks = [
    { name: 'billing admin', expected: 403, run: () => billingAdmin.GET(authenticatedRequest('/api/billing/admin')) },
    { name: 'all audits admin', expected: 403, run: () => auditsAdmin.GET(authenticatedRequest('/api/audits/admin')) },
    { name: 'operations backup', expected: 403, run: () => operationsBackup.GET(authenticatedRequest('/api/admin/backup') as never) },
    { name: 'own billing status', expected: 200, run: () => billingStatus.GET(authenticatedRequest('/api/billing/status')) },
    { name: 'own audits', expected: 200, run: () => myAudits.GET(authenticatedRequest('/api/audits/my')) },
  ];

  const results: Array<{ name: string; status: number; expected: number; passed: boolean }> = [];
  for (const check of checks) {
    const response = await check.run();
    results.push({ name: check.name, status: response.status, expected: check.expected, passed: response.status === check.expected });
  }

  console.log(JSON.stringify({ accountRole: account.role, superAdmin: false, checks: results }, null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Permission smoke test failed.');
  process.exitCode = 1;
});

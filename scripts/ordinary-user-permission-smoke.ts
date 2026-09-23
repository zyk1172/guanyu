import * as NextEnv from '@next/env';

const loadEnvConfig = ((NextEnv as unknown as { default?: typeof NextEnv }).default?.loadEnvConfig ?? NextEnv.loadEnvConfig) as typeof NextEnv.loadEnvConfig;
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

async function main() {
  loadEnvConfig(process.cwd());

  const email = String(process.env.TEST_USER_EMAIL || '').trim().toLowerCase();
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;

  if (!email) throw new Error('Set TEST_USER_EMAIL to the ordinary account being checked.');
  if (!nextAuthSecret) throw new Error('NEXTAUTH_SECRET is required.');

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
    select: { id: true, email: true, role: true, isBanned: true, sessionVersion: true },
  });

  if (!account) throw new Error('The requested ordinary test account does not exist.');
  if (account.isBanned) throw new Error('The requested ordinary test account is banned.');
  if (await getSuperAdminStatus(account.id)) throw new Error('SECURITY FAILURE: the test account resolves as a super administrator.');

  const authenticatedRequest = async (path: string) => {
    const token = await encode({
      secret: nextAuthSecret,
      maxAge: 30 * 24 * 60 * 60,
      token: {
        id: account.id,
        email: account.email,
        sessionVersion: account.sessionVersion,
      },
    });
    return new NextRequest(`http://localhost${path}`, {
      headers: {
        cookie: `next-auth.session-token=${token}`,
      },
    });
  };

  const checks = [
    { name: 'billing admin', expected: 403, run: async () => billingAdmin.GET(await authenticatedRequest('/api/billing/admin')) },
    { name: 'all audits admin', expected: 403, run: async () => auditsAdmin.GET(await authenticatedRequest('/api/audits/admin')) },
    { name: 'operations backup', expected: 403, run: async () => operationsBackup.GET(await authenticatedRequest('/api/admin/backup') as never) },
    { name: 'own billing status', expected: 200, run: async () => billingStatus.GET(await authenticatedRequest('/api/billing/status')) },
    { name: 'own audits', expected: 200, run: async () => myAudits.GET(await authenticatedRequest('/api/audits/my')) },
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

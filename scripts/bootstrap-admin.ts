import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd());
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const secret = String(process.env.BOOTSTRAP_ADMIN_SECRET || '');
  const expectedSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || '');
  if (!email || !secret || !expectedSecret) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_SECRET and ADMIN_BOOTSTRAP_SECRET.');
  }
  if (secret !== expectedSecret) {
    throw new Error('BOOTSTRAP_ADMIN_SECRET does not match ADMIN_BOOTSTRAP_SECRET.');
  }

  const [{ prisma }] = await Promise.all([import('../lib/prisma')]);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account found for ${email}.`);
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'super_admin' },
  });
  console.log(`Promoted ${email} to super_admin.`);
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Admin bootstrap failed.');
  process.exitCode = 1;
});

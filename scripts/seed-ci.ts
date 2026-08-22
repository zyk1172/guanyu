import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password-core.mjs';

const accounts = [
  { email: 'ci-ordinary@example.com', role: 'user', planType: 'free' },
  { email: 'ci-pro@example.com', role: 'user', planType: 'points' },
  { email: 'ci-admin@example.com', role: 'super_admin', planType: 'free' },
] as const;

async function main() {
  for (const account of accounts) {
    const password = await hashPassword(`ci-only-${account.role}-password`);
    await prisma.user.upsert({
      where: { email: account.email },
      update: { password, role: account.role, planType: account.planType, isBanned: false },
      create: {
        email: account.email,
        password,
        role: account.role,
        planType: account.planType,
        settings: {
          create: {
            defaultModelName: 'gpt-4o',
            llmBaseUrl: 'https://api.openai.com/v1',
            defaultReasoningDepth: 'medium',
            defaultIsPublic: false,
            defaultEnableCharts: true,
          },
        },
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

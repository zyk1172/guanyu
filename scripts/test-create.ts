import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.create({
      data: {
        email: 'simple@demo.com',
        password: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
      },
    });
    console.log('User created:', user.id, user.email);
  } catch (e: any) {
    console.error('Error:', e.message);
    console.error('Code:', e.code);
    if (e.meta) console.error('Meta:', e.meta);
  }
}

main().then(() => prisma.$disconnect());

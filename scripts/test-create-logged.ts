import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'logged@demo.com',
      password: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    },
  });
  console.log('Created:', user.id);
}

main().then(() => prisma.$disconnect());

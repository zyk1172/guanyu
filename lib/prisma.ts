import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({
    log: ['error', 'warn'],
  });
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma() as any;
    const value = client[property as keyof PrismaClient];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;

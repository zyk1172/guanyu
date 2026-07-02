import { prisma } from '@/lib/prisma';

let schemaPromise: Promise<void> | null = null;

export function ensureRuntimeSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "creditBalanceCents" INTEGER NOT NULL DEFAULT 0;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AppSetting"
        ADD COLUMN IF NOT EXISTS "alipayPointsQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-points.jpg',
        ADD COLUMN IF NOT EXISTS "alipayByokQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-byok.jpg';
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PointTransaction"
        ADD COLUMN IF NOT EXISTS "deltaCents" INTEGER,
        ADD COLUMN IF NOT EXISTS "balanceAfterCents" INTEGER;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ExtensionLinkCode" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "codeHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "usedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ExtensionLinkCode_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionLinkCode_codeHash_key" ON "ExtensionLinkCode"("codeHash");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ExtensionLinkCode_userId_idx" ON "ExtensionLinkCode"("userId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ExtensionLinkCode_expiresAt_idx" ON "ExtensionLinkCode"("expiresAt");
      `);
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ExtensionLinkCode_userId_fkey'
          ) THEN
            ALTER TABLE "ExtensionLinkCode"
            ADD CONSTRAINT "ExtensionLinkCode_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ExtensionSession" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "tokenHash" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "browser" TEXT,
          "lastUsedAt" TIMESTAMP(3),
          "expiresAt" TIMESTAMP(3),
          "revokedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ExtensionSession_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionSession_tokenHash_key" ON "ExtensionSession"("tokenHash");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ExtensionSession_userId_idx" ON "ExtensionSession"("userId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ExtensionSession_lastUsedAt_idx" ON "ExtensionSession"("lastUsedAt");
      `);
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ExtensionSession_userId_fkey'
          ) THEN
            ALTER TABLE "ExtensionSession"
            ADD CONSTRAINT "ExtensionSession_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

import { prisma } from '@/lib/prisma';
import { shouldBootstrapRuntimeSchema } from '@/lib/runtime-schema-core.mjs';

let schemaPromise: Promise<void> | null = null;

export function ensureRuntimeSchema() {
  // Schema changes must be applied by an explicit deployment/bootstrap step.
  // Running DDL in every cold serverless function can serialize normal requests
  // behind the Postgres advisory lock and exhaust the Vercel function timeout.
  if (!shouldBootstrapRuntimeSchema(process.env.GUANYU_RUNTIME_SCHEMA_BOOTSTRAP)) {
    return Promise.resolve();
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      // Serverless functions can cold-start in parallel. PostgreSQL's
      // `IF NOT EXISTS` DDL still races while a relation type is being created,
      // so serialize this compatibility bootstrap across all instances.
      await prisma.$executeRawUnsafe('SELECT pg_advisory_lock(83672703);');
      try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "creditBalanceCents" INTEGER NOT NULL DEFAULT 0;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT false;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "UserSettings"
        ADD COLUMN IF NOT EXISTS "defaultReportLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
        ADD COLUMN IF NOT EXISTS "rssFeedUrlsJson" TEXT NOT NULL DEFAULT '[]';
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Audit"
        ADD COLUMN IF NOT EXISTS "reportLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
        ADD COLUMN IF NOT EXISTS "completionMarkdown" TEXT,
        ADD COLUMN IF NOT EXISTS "completionGeneratedAt" TIMESTAMP(3);
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "AppSetting"
        ADD COLUMN IF NOT EXISTS "alipayPointsQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-points.jpg',
        ADD COLUMN IF NOT EXISTS "alipayByokQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-byok.jpg',
        ADD COLUMN IF NOT EXISTS "paypalQrImageUrl" TEXT NOT NULL DEFAULT '/paypal-qr.jpg',
        ADD COLUMN IF NOT EXISTS "adminRssFeedIdsJson" TEXT NOT NULL DEFAULT '[]';
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PointTransaction"
        ADD COLUMN IF NOT EXISTS "deltaCents" INTEGER,
        ADD COLUMN IF NOT EXISTS "balanceAfterCents" INTEGER;
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PurchaseOrder"
        ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'CNY';
      `);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "VerificationCode"
        ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
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
        CREATE TABLE IF NOT EXISTS "AuditJob" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "inputJson" TEXT NOT NULL,
          "auditId" TEXT,
          "error" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AuditJob_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "EmailDelivery" (
          "id" TEXT NOT NULL,
          "userId" TEXT,
          "auditId" TEXT,
          "category" TEXT NOT NULL,
          "recipient" TEXT NOT NULL,
          "subject" TEXT NOT NULL,
          "provider" TEXT,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "error" TEXT,
          "metadataJson" TEXT NOT NULL DEFAULT '{}',
          "sentAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "EmailDelivery_userId_createdAt_idx" ON "EmailDelivery"("userId", "createdAt");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "EmailDelivery_auditId_idx" ON "EmailDelivery"("auditId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");
      `);
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'EmailDelivery_userId_fkey'
          ) THEN
            ALTER TABLE "EmailDelivery"
            ADD CONSTRAINT "EmailDelivery_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'EmailDelivery_auditId_fkey'
          ) THEN
            ALTER TABLE "EmailDelivery"
            ADD CONSTRAINT "EmailDelivery_auditId_fkey"
            FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AuditJob_userId_idx" ON "AuditJob"("userId");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AuditJob_status_idx" ON "AuditJob"("status");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AuditJob_createdAt_idx" ON "AuditJob"("createdAt");
      `);
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'AuditJob_userId_fkey'
          ) THEN
            ALTER TABLE "AuditJob"
            ADD CONSTRAINT "AuditJob_userId_fkey"
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
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ServiceOperation" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "idempotencyKey" TEXT NOT NULL,
          "operation" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'RUNNING',
          "reservedCredits" INTEGER NOT NULL DEFAULT 0,
          "resultId" TEXT,
          "resultHash" TEXT,
          "resultJson" TEXT,
          "errorCode" TEXT,
          "expiresAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ServiceOperation_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOperation_userId_idempotencyKey_key" ON "ServiceOperation"("userId", "idempotencyKey");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ServiceOperation_userId_status_createdAt_idx" ON "ServiceOperation"("userId", "status", "createdAt");
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ServiceOperation_operation_status_expiresAt_idx" ON "ServiceOperation"("operation", "status", "expiresAt");
      `);
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOperation_userId_fkey'
          ) THEN
            ALTER TABLE "ServiceOperation"
            ADD CONSTRAINT "ServiceOperation_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
      } finally {
        await prisma.$executeRawUnsafe('SELECT pg_advisory_unlock(83672703);').catch(() => {});
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

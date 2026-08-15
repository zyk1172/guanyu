-- AlterTable
ALTER TABLE "Audit" ALTER COLUMN "isPublic" SET DEFAULT false;
ALTER TABLE "Audit" ADD COLUMN "indexable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuditJob" ADD COLUMN "inputRetentionExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserSettings" ALTER COLUMN "defaultIsPublic" SET DEFAULT false;

-- CreateTable
CREATE TABLE "AccountDeletionLog" (
    "id" TEXT NOT NULL,
    "userIdHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDeletionLog_createdAt_idx" ON "AccountDeletionLog"("createdAt");

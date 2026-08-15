-- AlterTable
ALTER TABLE "ServiceOperation" ADD COLUMN "currentAttempt" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Audit" ADD COLUMN "sourceJobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Audit_sourceJobId_key" ON "Audit"("sourceJobId");

-- DataMigration: existing user preference should be private by default.
UPDATE "UserSettings" SET "defaultIsPublic" = false WHERE "defaultIsPublic" = true;

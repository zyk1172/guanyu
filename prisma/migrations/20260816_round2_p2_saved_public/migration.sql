-- AlterTable
ALTER TABLE "Audit" ADD COLUMN "isSourcePublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SavedArticle" ADD COLUMN "clientRequestId" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "defaultSaveResult";
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "defaultAnalysisMode";

-- CreateIndex
CREATE UNIQUE INDEX "SavedArticle_userId_clientRequestId_key" ON "SavedArticle"("userId", "clientRequestId");

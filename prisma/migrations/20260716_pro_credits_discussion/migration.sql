-- Non-destructive migration. Legacy point and BYOK columns remain intact.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "creditBalanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "User" SET "creditBalanceAmount" = "creditBalanceCents"::numeric / 100
WHERE "creditBalanceAmount" = 0 AND "creditBalanceCents" <> 0;
UPDATE "User" SET "creditBalanceAmount" = "creditBalance"::numeric
WHERE "creditBalanceAmount" = 0 AND "creditBalance" <> 0 AND "creditBalanceCents" = 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupBonusGrantedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "proAccessActivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "proAccessExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingProAccessDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingProAccessExpiresAt" TIMESTAMP(3);
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "modelSource" TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE "Audit" ADD COLUMN IF NOT EXISTS "reportVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Audit" ADD COLUMN IF NOT EXISTS "discussionLockedAt" TIMESTAMP(3);
ALTER TABLE "Audit" ADD COLUMN IF NOT EXISTS "discussionLockedById" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "balanceBefore" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "balanceAfterAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "transactionType" TEXT NOT NULL DEFAULT 'ADMIN_ADJUSTMENT';
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "relatedTaskId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "relatedReportVersion" INTEGER;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "relatedDiscussionMessageId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
UPDATE "PointTransaction" SET "amount" = COALESCE("deltaCents", "delta" * 100)::numeric / 100, "balanceAfterAmount" = COALESCE("balanceAfterCents", "balanceAfter" * 100)::numeric / 100
WHERE "amount" = 0 AND ("deltaCents" IS NOT NULL OR "delta" <> 0);
CREATE UNIQUE INDEX IF NOT EXISTS "PointTransaction_userId_idempotencyKey_key" ON "PointTransaction"("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT 'STARTER';
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "proAccessDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "fulfilledAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "providerTransactionId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "paymentEmail" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "webhookEventId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_providerTransactionId_key" ON "PurchaseOrder"("providerTransactionId") WHERE "providerTransactionId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_webhookEventId_key" ON "PurchaseOrder"("webhookEventId") WHERE "webhookEventId" IS NOT NULL;
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "paypalStarterCreditsUrl" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "paypalProCreditsUrl" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "alipayStarterCreditsUrl" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "alipayProCreditsUrl" TEXT;
-- The tables below have no dependency on legacy data and can be dropped in a rollback.
CREATE TABLE IF NOT EXISTS "RssFeed" ("id" TEXT PRIMARY KEY, "sourceType" TEXT NOT NULL DEFAULT 'USER', "ownerUserId" TEXT, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT true, "lastFetchedAt" TIMESTAMP(3), "lastError" TEXT, "lastManualRefreshAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "RssFeed_ownerUserId_url_key" ON "RssFeed"("ownerUserId", "url");
CREATE TABLE IF NOT EXISTS "RssItem" ("id" TEXT PRIMARY KEY, "feedId" TEXT NOT NULL, "externalId" TEXT NOT NULL, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "author" TEXT, "summary" TEXT, "contentSnippet" TEXT, "publishedAt" TIMESTAMP(3), "imageUrl" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "RssItem_feedId_externalId_key" ON "RssItem"("feedId", "externalId");
CREATE TABLE IF NOT EXISTS "ReportDiscussionMessage" ("id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL, "reportVersionAtPost" INTEGER NOT NULL DEFAULT 1, "userId" TEXT NOT NULL, "parentMessageId" TEXT, "content" TEXT NOT NULL, "contentFormat" TEXT NOT NULL DEFAULT 'plain', "languageCode" TEXT NOT NULL DEFAULT 'zh-CN', "status" TEXT NOT NULL DEFAULT 'VISIBLE', "isEdited" BOOLEAN NOT NULL DEFAULT false, "editedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), "pointTransactionId" TEXT, "idempotencyKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ReportDiscussionMessage_userId_idempotencyKey_key" ON "ReportDiscussionMessage"("userId", "idempotencyKey");
CREATE TABLE IF NOT EXISTS "DiscussionReport" ("id" TEXT PRIMARY KEY, "messageId" TEXT NOT NULL, "reporterUserId" TEXT NOT NULL, "reason" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "DiscussionReport_messageId_reporterUserId_key" ON "DiscussionReport"("messageId", "reporterUserId");
CREATE TABLE IF NOT EXISTS "ExportArtifact" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "reportId" TEXT NOT NULL, "reportVersion" INTEGER NOT NULL, "exportFormat" TEXT NOT NULL, "templateVersion" TEXT NOT NULL DEFAULT '1', "contentHash" TEXT NOT NULL, "storagePath" TEXT, "content" TEXT, "downloadFilename" TEXT NOT NULL, "fileHash" TEXT, "fileSizeBytes" INTEGER, "pageCount" INTEGER, "language" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "pointTransactionId" TEXT, "errorCode" TEXT, "errorMessageSanitized" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ExportArtifact_userId_reportId_reportVersion_exportFormat_key" ON "ExportArtifact"("userId", "reportId", "reportVersion", "exportFormat");

-- Add foreign keys after the tables exist. The guarded blocks keep the migration
-- safe to re-run on installations where a prior deploy created these tables.
DO $$ BEGIN
  ALTER TABLE "RssFeed" ADD CONSTRAINT "RssFeed_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RssItem" ADD CONSTRAINT "RssItem_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "RssFeed"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReportDiscussionMessage" ADD CONSTRAINT "ReportDiscussionMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Audit"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReportDiscussionMessage" ADD CONSTRAINT "ReportDiscussionMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReportDiscussionMessage" ADD CONSTRAINT "ReportDiscussionMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "ReportDiscussionMessage"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DiscussionReport" ADD CONSTRAINT "DiscussionReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ReportDiscussionMessage"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DiscussionReport" ADD CONSTRAINT "DiscussionReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Audit"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Initial schema from the parent of the first historical migration (7ea6e7d).
-- Existing installations may already have these objects.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "planType" TEXT NOT NULL DEFAULT 'free',
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "creditBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "freeQuotaDate" TEXT,
    "freeQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultModelName" TEXT NOT NULL DEFAULT 'gpt-4o',
    "llmBaseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "llmApiKeyEncrypted" TEXT,
    "enableTavilySearch" BOOLEAN NOT NULL DEFAULT false,
    "tavilyApiKeyEncrypted" TEXT,
    "tavilySearchDepth" TEXT NOT NULL DEFAULT 'basic',
    "enableSerperSearch" BOOLEAN NOT NULL DEFAULT false,
    "serperApiKeyEncrypted" TEXT,
    "defaultAudienceTheme" TEXT NOT NULL DEFAULT 'youth',
    "defaultReportLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
    "defaultReasoningDepth" TEXT NOT NULL DEFAULT 'medium',
    "defaultAnalysisMode" TEXT NOT NULL DEFAULT 'quick',
    "defaultIsPublic" BOOLEAN NOT NULL DEFAULT true,
    "defaultSaveResult" BOOLEAN NOT NULL DEFAULT true,
    "defaultEnableCharts" BOOLEAN NOT NULL DEFAULT true,
    "rssFeedUrlsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Audit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "publishedAt" TEXT NOT NULL,
    "publishedAtSource" TEXT NOT NULL DEFAULT 'unknown',
    "publishedAtConfidence" TEXT NOT NULL DEFAULT 'unknown',
    "reportType" TEXT NOT NULL DEFAULT 'deep',
    "readingValue" TEXT NOT NULL DEFAULT '暂无法判断',
    "originalContent" TEXT NOT NULL,
    "focus" TEXT,
    "analysisMode" TEXT NOT NULL,
    "reportLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
    "reasoningDepth" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "newsSummary" TEXT NOT NULL,
    "auditResultJson" TEXT NOT NULL,
    "credibilityScore" INTEGER NOT NULL DEFAULT 0,
    "informationCompletenessScore" INTEGER NOT NULL DEFAULT 0,
    "narrativeBiasScore" INTEGER NOT NULL DEFAULT 0,
    "evidenceStrengthScore" INTEGER NOT NULL DEFAULT 0,
    "speculationRiskScore" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "heatScore" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completionMarkdown" TEXT,
    "completionGeneratedAt" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputJson" TEXT NOT NULL,
    "auditId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "adminModelName" TEXT NOT NULL DEFAULT 'gpt-4o',
    "adminLlmBaseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    "adminLlmApiKeyEncrypted" TEXT,
    "adminTavilyApiKeyEncrypted" TEXT,
    "adminSerperApiKeyEncrypted" TEXT,
    "enableAdminTavilySearch" BOOLEAN NOT NULL DEFAULT false,
    "enableAdminSerperSearch" BOOLEAN NOT NULL DEFAULT false,
    "adminRssFeedIdsJson" TEXT NOT NULL DEFAULT '[]',
    "alipayQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-qr.jpg',
    "alipayPointsQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-points.jpg',
    "alipayByokQrImageUrl" TEXT NOT NULL DEFAULT '/alipay-byok.jpg',
    "paypalQrImageUrl" TEXT NOT NULL DEFAULT '/paypal-qr.jpg',
    "alipayQrNote" TEXT NOT NULL DEFAULT '6 元购买 30 点；30 元买断后可填写自己的大模型和搜索 API。付款备注请填写账号邮箱、昵称或转账时间。',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PointTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "deltaCents" INTEGER,
    "balanceAfterCents" INTEGER,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "auditId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT 'points_30',
    "packageName" TEXT NOT NULL DEFAULT '30 点套餐',
    "amountCents" INTEGER NOT NULL DEFAULT 600,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "points" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT NOT NULL DEFAULT 'alipay_qr',
    "paymentNote" TEXT,
    "adminNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VerificationCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'register',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExtensionLinkCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Audit_userId_idx" ON "Audit"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Audit_heatScore_idx" ON "Audit"("heatScore");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Audit_createdAt_idx" ON "Audit"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditJob_userId_idx" ON "AuditJob"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditJob_status_idx" ON "AuditJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditJob_createdAt_idx" ON "AuditJob"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailDelivery_userId_createdAt_idx" ON "EmailDelivery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailDelivery_auditId_idx" ON "EmailDelivery"("auditId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PointTransaction_userId_idx" ON "PointTransaction"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PointTransaction_createdAt_idx" ON "PointTransaction"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_userId_idx" ON "PurchaseOrder"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificationCode_email_idx" ON "VerificationCode"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificationCode_purpose_idx" ON "VerificationCode"("purpose");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificationCode_createdAt_idx" ON "VerificationCode"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimitEvent_userId_action_createdAt_idx" ON "RateLimitEvent"("userId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionLinkCode_codeHash_key" ON "ExtensionLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtensionLinkCode_userId_idx" ON "ExtensionLinkCode"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtensionLinkCode_expiresAt_idx" ON "ExtensionLinkCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionSession_tokenHash_key" ON "ExtensionSession"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtensionSession_userId_idx" ON "ExtensionSession"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExtensionSession_lastUsedAt_idx" ON "ExtensionSession"("lastUsedAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Audit" ADD CONSTRAINT "Audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AuditJob" ADD CONSTRAINT "AuditJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "RateLimitEvent" ADD CONSTRAINT "RateLimitEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ExtensionLinkCode" ADD CONSTRAINT "ExtensionLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ExtensionSession" ADD CONSTRAINT "ExtensionSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

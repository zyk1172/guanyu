-- Non-destructive platform model catalog and immutable task/report snapshots.
-- Existing AppSetting values seed the first baseline model so no API key must
-- be entered again during deployment.

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "defaultPlatformModelConfigId" TEXT;

ALTER TABLE "Audit"
  ADD COLUMN IF NOT EXISTS "platformModelConfigIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelDisplayNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelProviderSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelSearchModeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelMultiplierBpsSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "modelConfigVersionSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "modelCreditCostCents" INTEGER;

ALTER TABLE "AuditJob"
  ADD COLUMN IF NOT EXISTS "modelSnapshotJson" TEXT,
  ADD COLUMN IF NOT EXISTS "creditCostCents" INTEGER;

ALTER TABLE "PointTransaction"
  ADD COLUMN IF NOT EXISTS "modelConfigIdSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelDisplayNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "modelMultiplierBpsSnapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "modelConfigVersionSnapshot" INTEGER;

CREATE TABLE IF NOT EXISTS "PlatformModelConfig" (
  "id" TEXT NOT NULL,
  "configKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'openai_compatible',
  "displayName" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "displayNameI18nJson" TEXT NOT NULL DEFAULT '{}',
  "descriptionI18nJson" TEXT NOT NULL DEFAULT '{}',
  "baseUrl" TEXT NOT NULL,
  "apiKeyEncrypted" TEXT,
  "modelId" TEXT NOT NULL,
  "reasoningDepth" TEXT NOT NULL DEFAULT 'medium',
  "searchMode" TEXT NOT NULL DEFAULT 'platform',
  "supportsAnalysis" BOOLEAN NOT NULL DEFAULT true,
  "supportsCompletion" BOOLEAN NOT NULL DEFAULT true,
  "supportsFollowup" BOOLEAN NOT NULL DEFAULT true,
  "creditMultiplierBps" INTEGER NOT NULL DEFAULT 100,
  "inputPriceMicrosPerMillion" INTEGER NOT NULL DEFAULT 0,
  "outputPriceMicrosPerMillion" INTEGER NOT NULL DEFAULT 0,
  "nativeSearchPriceMicrosPerRequest" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isVisibleToUsers" BOOLEAN NOT NULL DEFAULT true,
  "isRecommended" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "configVersion" INTEGER NOT NULL DEFAULT 1,
  "lastTestStatus" TEXT,
  "lastTestMessage" TEXT,
  "lastTestedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformModelConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformModelConfig_configKey_key"
  ON "PlatformModelConfig"("configKey");
CREATE INDEX IF NOT EXISTS "PlatformModelConfig_enabled_visible_order_idx"
  ON "PlatformModelConfig"("isEnabled", "isVisibleToUsers", "sortOrder");
CREATE INDEX IF NOT EXISTS "PlatformModelConfig_isDefault_idx"
  ON "PlatformModelConfig"("isDefault");
CREATE INDEX IF NOT EXISTS "PlatformModelConfig_archivedAt_idx"
  ON "PlatformModelConfig"("archivedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformModelConfig_single_default_key"
  ON "PlatformModelConfig"((1)) WHERE "isDefault" = true AND "archivedAt" IS NULL;

INSERT INTO "PlatformModelConfig" (
  "id", "configKey", "provider", "displayName", "description", "baseUrl",
  "apiKeyEncrypted", "modelId", "reasoningDepth", "searchMode",
  "creditMultiplierBps", "isEnabled", "isVisibleToUsers", "isRecommended",
  "isDefault", "sortOrder", "configVersion", "createdAt", "updatedAt"
)
SELECT
  'platform-deepseek-default',
  'deepseek-v4-pro-baseline',
  'openai_compatible',
  CASE
    WHEN lower(COALESCE("adminModelName", '')) LIKE '%deepseek%' THEN 'DeepSeek V4 Pro'
    ELSE COALESCE(NULLIF("adminModelName", ''), 'DeepSeek V4 Pro')
  END,
  '观隅基准平台模型，使用现有平台联网搜索。',
  COALESCE(NULLIF("adminLlmBaseUrl", ''), 'https://api.deepseek.com'),
  "adminLlmApiKeyEncrypted",
  COALESCE(NULLIF("adminModelName", ''), 'deepseek-v4-pro'),
  'medium',
  'platform',
  100,
  true,
  true,
  true,
  true,
  0,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AppSetting"
WHERE "id" = 'global'
  AND NOT EXISTS (SELECT 1 FROM "PlatformModelConfig")
ON CONFLICT ("configKey") DO NOTHING;

CREATE TABLE IF NOT EXISTS "ModelUsageEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "auditId" TEXT,
  "jobId" TEXT,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "usageSource" TEXT NOT NULL DEFAULT 'platform',
  "platformModelConfigIdSnapshot" TEXT,
  "modelDisplayNameSnapshot" TEXT,
  "modelNameSnapshot" TEXT,
  "modelProviderSnapshot" TEXT,
  "modelConfigVersionSnapshot" INTEGER,
  "modelMultiplierBpsSnapshot" INTEGER,
  "creditCostCents" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
  "searchRequestCount" INTEGER NOT NULL DEFAULT 0,
  "nativeSearchRequestCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedExternalCostMicros" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModelUsageEvent_model_created_idx"
  ON "ModelUsageEvent"("platformModelConfigIdSnapshot", "createdAt");
CREATE INDEX IF NOT EXISTS "ModelUsageEvent_user_created_idx"
  ON "ModelUsageEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ModelUsageEvent_operation_status_created_idx"
  ON "ModelUsageEvent"("operation", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModelUsageEvent_userId_fkey'
  ) THEN
    ALTER TABLE "ModelUsageEvent"
      ADD CONSTRAINT "ModelUsageEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "llmProvider" TEXT NOT NULL DEFAULT 'openai_compatible';

ALTER TABLE "AppSetting"
  ADD COLUMN IF NOT EXISTS "newsSearchDeepseekKeyEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "newsSearchAiModelConfigId" TEXT;

-- The stored key was already designated for DeepSeek Search. Retain that
-- designation even if the associated report model is later changed.
UPDATE "AppSetting" AS settings
SET "newsSearchDeepseekKeyEncrypted" = model."deepseekApiKeyEncrypted"
FROM "PlatformModelConfig" AS model
WHERE model."id" = settings."newsSearchModelConfigId"
  AND model."archivedAt" IS NULL AND model."isEnabled" AND model."isVisibleToUsers"
  AND settings."newsSearchDeepseekKeyEncrypted" IS NULL;

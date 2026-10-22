ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "searchProvider" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "deepseekApiKeyEncrypted" TEXT;

ALTER TABLE "PlatformModelConfig"
  ADD COLUMN IF NOT EXISTS "searchProvider" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "deepseekApiKeyEncrypted" TEXT;

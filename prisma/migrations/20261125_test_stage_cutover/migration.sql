ALTER TABLE "EmailDelivery"
  ADD COLUMN IF NOT EXISTS "providerRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "payloadEncrypted" TEXT;

-- Prior versions only observed the submission response, not final delivery.
UPDATE "EmailDelivery" SET "status" = 'unknown' WHERE "status" = 'sent';

CREATE INDEX IF NOT EXISTS "PlatformModelConfig_isEnabled_isVisibleToUsers_sortOrder_idx"
  ON "PlatformModelConfig" ("isEnabled", "isVisibleToUsers", "sortOrder");
DROP INDEX IF EXISTS "PlatformModelConfig_enabled_visible_order_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformModelConfig_single_default_key"
  ON "PlatformModelConfig" ((1)) WHERE "isDefault" = true AND "archivedAt" IS NULL;

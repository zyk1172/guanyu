ALTER TABLE "AppSetting"
  ADD COLUMN "newsSearchProvider" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "newsSearchModelConfigId" TEXT,
  ADD COLUMN "newsSearchDailyLimit" INTEGER NOT NULL DEFAULT 200;

CREATE TABLE "NewsSearchCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cacheKey" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL,
  "resultJson" TEXT,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "NewsSearchCache_expiresAt_idx" ON "NewsSearchCache"("expiresAt");

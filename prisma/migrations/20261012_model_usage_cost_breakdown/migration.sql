ALTER TABLE "ModelUsageEvent"
  ADD COLUMN IF NOT EXISTS "estimatedSearchCostMicros" INTEGER,
  ADD COLUMN IF NOT EXISTS "costCoverage" TEXT NOT NULL DEFAULT 'legacy_partial',
  ADD COLUMN IF NOT EXISTS "costBreakdownJson" TEXT;

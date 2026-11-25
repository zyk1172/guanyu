ALTER TABLE "AuditJob" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AuditJob_userId_clientRequestId_key"
  ON "AuditJob" ("userId", "clientRequestId");

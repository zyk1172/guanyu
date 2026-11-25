CREATE TABLE "AuditManagementRequest" (
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "changed" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditManagementRequest_pkey" PRIMARY KEY ("userId", "requestId"),
  CONSTRAINT "AuditManagementRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuditManagementRequest_createdAt_idx" ON "AuditManagementRequest"("createdAt");

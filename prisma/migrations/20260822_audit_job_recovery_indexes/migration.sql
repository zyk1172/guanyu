-- Support low-cost scans for due retries and expired running jobs.
CREATE INDEX "AuditJob_status_nextAttemptAt_idx"
  ON "AuditJob"("status", "nextAttemptAt");

CREATE INDEX "AuditJob_status_leaseExpiresAt_idx"
  ON "AuditJob"("status", "leaseExpiresAt");

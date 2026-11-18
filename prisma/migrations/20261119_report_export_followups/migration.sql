CREATE TABLE "ReportFollowup" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFollowup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReportFollowup_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportFollowup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReportFollowup_reportId_reportVersion_userId_createdAt_idx" ON "ReportFollowup"("reportId", "reportVersion", "userId", "createdAt");
CREATE INDEX "ReportFollowup_userId_idx" ON "ReportFollowup"("userId");

ALTER TABLE "ExportArtifact" ADD COLUMN "includeOriginal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExportArtifact" ADD COLUMN "snapshotHash" TEXT;
CREATE UNIQUE INDEX "ExportArtifact_variant_key" ON "ExportArtifact"("userId", "reportId", "reportVersion", "exportFormat", "includeOriginal");
DROP INDEX IF EXISTS "ExportArtifact_userId_reportId_reportVersion_exportFormat_key";

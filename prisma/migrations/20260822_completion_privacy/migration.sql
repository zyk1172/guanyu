-- Keep AI completion private unless a future explicit owner action publishes it.
ALTER TABLE "Audit" ADD COLUMN "isCompletionPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ServiceOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "resultId" TEXT,
    "resultHash" TEXT,
    "resultJson" TEXT,
    "errorCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOperation_userId_idempotencyKey_key" ON "ServiceOperation"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ServiceOperation_userId_status_createdAt_idx" ON "ServiceOperation"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOperation_operation_status_expiresAt_idx" ON "ServiceOperation"("operation", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "ServiceOperation" ADD CONSTRAINT "ServiceOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

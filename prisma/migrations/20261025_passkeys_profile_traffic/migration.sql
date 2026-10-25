ALTER TABLE "User" ADD COLUMN "gender" TEXT, ADD COLUMN "country" TEXT;
CREATE TABLE "Passkey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "credentialId" TEXT NOT NULL UNIQUE,
  "publicKey" BYTEA NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "transports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3)
);
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");
CREATE TABLE "PasskeyChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "challenge" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sessionVersion" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");
CREATE TABLE "PageView" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "visitorHash" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "isLoggedIn" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PageView_createdAt_visitorHash_idx" ON "PageView"("createdAt", "visitorHash");
CREATE INDEX "PageView_visitorHash_createdAt_idx" ON "PageView"("visitorHash", "createdAt");

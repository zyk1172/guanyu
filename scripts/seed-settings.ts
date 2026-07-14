import crypto, { randomBytes, scryptSync } from 'crypto';
import { PrismaClient } from '@prisma/client';

const ALGORITHM = 'aes-256-gcm';
const rawSecret = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
const apiKey = process.env.SEED_LLM_API_KEY;
const llmBaseUrl = process.env.SEED_LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const modelName = process.env.SEED_LLM_MODEL || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o';

if (!rawSecret) {
  throw new Error('APP_ENCRYPTION_KEY or NEXTAUTH_SECRET is required.');
}

if (!apiKey) {
  throw new Error('SEED_LLM_API_KEY is required.');
}

const key = crypto.createHash('sha256').update(rawSecret).digest();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const encryptedStr = [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');

const prisma = new PrismaClient();
function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const digest = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt$${salt}$${digest}`;
}

async function main() {
  // Delete any existing settings and user
  await prisma.userSettings.deleteMany({
    where: { userId: 'c1234567890abcdef1234567890abcdef' },
  });
  await prisma.user.deleteMany({
    where: { id: 'c1234567890abcdef1234567890abcdef' },
  });

  // Create user with proper cuid format (25 chars)
  const user = await prisma.user.create({
    data: {
      email: 'demo@news.local',
      password: hashPassword(process.env.SEED_DEMO_PASSWORD || 'change-this-demo-password'),
    },
  });
  console.log('User created, id:', user.id);

  await prisma.userSettings.create({
    data: {
      userId: user.id,
      defaultModelName: modelName,
      llmBaseUrl,
      llmApiKeyEncrypted: encryptedStr,
    },
  });
  console.log('Settings created');
}
main().then(() => prisma.$disconnect());

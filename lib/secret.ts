import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getSecretKey(): Buffer {
  const rawSecret = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!rawSecret) {
    throw new Error('APP_ENCRYPTION_KEY or NEXTAUTH_SECRET is required to encrypt model API keys.');
  }

  return crypto.createHash('sha256').update(rawSecret).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(value?: string | null): string {
  if (!value) return '';

  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) return '';

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getSecretKey(),
      Buffer.from(ivRaw, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Failed to decrypt model API key:', error);
    return '';
  }
}

import crypto from 'crypto';

export function privacyHmacHash(value: string) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const pepper = process.env.HASH_PEPPER
    || (isProduction ? '' : (process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET));
  if (!pepper) {
    throw new Error('HASH_PEPPER is required in production for privacy-preserving hashing.');
  }
  return crypto.createHmac('sha256', pepper).update(value).digest('hex');
}

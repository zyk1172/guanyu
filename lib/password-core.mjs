import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const PASSWORD_PREFIX = 'scrypt';
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;
export const MAX_PASSWORD_BYTES = 1024;
const scrypt = promisify(scryptCallback);

export function assertValidPasswordInput(password) {
  const value = String(password ?? '');
  const bytes = Buffer.byteLength(value, 'utf8');
  if (Array.from(value).length < 8) throw new Error('密码至少需要 8 个字符。');
  if (bytes > MAX_PASSWORD_BYTES) throw new Error(`密码不能超过 ${MAX_PASSWORD_BYTES} 个字节。`);
}

function isValidPasswordInput(password) {
  const value = String(password ?? '');
  return Array.from(value).length >= 8 && Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES;
}

export async function hashPassword(password) {
  const value = String(password ?? '');
  assertValidPasswordInput(value);
  const salt = randomBytes(16).toString('base64url');
  const digest = Buffer.from(await scrypt(value, salt, 64)).toString('base64url');
  return `${PASSWORD_PREFIX}$${salt}$${digest}`;
}

export async function verifyPassword(password, storedValue) {
  const value = String(password ?? '');
  if (!isValidPasswordInput(value) || typeof storedValue !== 'string') {
    return { valid: false, needsUpgrade: false };
  }
  if (storedValue.startsWith(`${PASSWORD_PREFIX}$`)) {
    const [, salt, encodedDigest] = storedValue.split('$');
    if (!salt || !encodedDigest) return { valid: false, needsUpgrade: false };
    const expected = Buffer.from(encodedDigest, 'base64url');
    const actual = await scrypt(value, salt, 64);
    return {
      valid: expected.length === actual.length && timingSafeEqual(expected, actual),
      needsUpgrade: false,
    };
  }

  // Existing accounts were created with this format. Accept only a valid legacy
  // digest and force an immediate scrypt upgrade after successful login.
  if (!LEGACY_SHA256_PATTERN.test(storedValue)) {
    return { valid: false, needsUpgrade: false };
  }
  const expected = Buffer.from(storedValue, 'hex');
  const actual = Buffer.from(createHash('sha256').update(value).digest('hex'), 'hex');
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  return {
    valid,
    needsUpgrade: valid,
  };
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const PASSWORD_PREFIX = 'scrypt';
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const digest = scryptSync(password, salt, 64).toString('base64url');
  return `${PASSWORD_PREFIX}$${salt}$${digest}`;
}

export function verifyPassword(password, storedValue) {
  if (storedValue.startsWith(`${PASSWORD_PREFIX}$`)) {
    const [, salt, encodedDigest] = storedValue.split('$');
    if (!salt || !encodedDigest) return { valid: false, needsUpgrade: false };
    const expected = Buffer.from(encodedDigest, 'base64url');
    const actual = scryptSync(password, salt, 64);
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
  const actual = Buffer.from(createHash('sha256').update(password).digest('hex'), 'hex');
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  return {
    valid,
    needsUpgrade: valid,
  };
}

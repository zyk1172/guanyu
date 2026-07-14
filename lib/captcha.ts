import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { assertCaptchaChallengeLimit, hashForStorage } from '@/lib/rate-limit';
import { createCaptchaText } from '@/lib/captcha-core.mjs';

function hashCode(value: string) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function createNumericCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max));
}

const CAPTCHA_GLYPHS: Record<string, string[]> = {
  '2': ['11110', '00001', '00010', '00100', '01000', '10000', '11111'], '3': ['11110', '00001', '00110', '00001', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'], K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'], W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'], Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

function buildCaptchaBmp(text: string) {
  const width = 210;
  const height = 64;
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const imageSize = rowBytes * height;
  const bitmap = Buffer.alloc(54 + imageSize, 0);
  bitmap.write('BM');
  bitmap.writeUInt32LE(bitmap.length, 2);
  bitmap.writeUInt32LE(54, 10);
  bitmap.writeUInt32LE(40, 14);
  bitmap.writeInt32LE(width, 18);
  bitmap.writeInt32LE(height, 22);
  bitmap.writeUInt16LE(1, 26);
  bitmap.writeUInt16LE(24, 28);
  bitmap.writeUInt32LE(imageSize, 34);

  const pixel = (x: number, y: number, red: number, green: number, blue: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = 54 + (height - y - 1) * rowBytes + x * 3;
    bitmap[offset] = blue;
    bitmap[offset + 1] = green;
    bitmap[offset + 2] = red;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixel(x, y, 238, 242, 255);
  for (let index = 0; index < 180; index += 1) pixel(crypto.randomInt(width), crypto.randomInt(height), 170, 180, 220);
  for (let index = 0; index < 6; index += 1) {
    const glyph = CAPTCHA_GLYPHS[text[index]] || CAPTCHA_GLYPHS.A;
    const originX = 14 + index * 32 + crypto.randomInt(-1, 2);
    const originY = 16 + crypto.randomInt(-2, 3);
    glyph.forEach((row, y) => row.split('').forEach((filled, x) => {
      if (filled !== '1') return;
      for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 4; dx += 1) pixel(originX + x * 4 + dx, originY + y * 4 + dy, 30, 41, 59);
    }));
  }
  return bitmap;
}

export async function createCaptchaChallenge(ip: string) {
  await assertCaptchaChallengeLimit(ip);
  const code = createCaptchaText();
  const challenge = await prisma.verificationCode.create({
    data: {
      email: `captcha:${crypto.randomUUID()}`,
      codeHash: hashCode(code),
      purpose: 'register_captcha',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      ipHash: hashForStorage(ip),
    },
  });

  return {
    challengeId: challenge.id,
    image: `data:image/bmp;base64,${buildCaptchaBmp(code).toString('base64')}`,
  };
}

export async function verifyCaptcha(challengeId: string, answer: string, ip: string) {
  const challenge = await prisma.verificationCode.findUnique({
    where: { id: challengeId },
  });

  if (!challenge || challenge.purpose !== 'register_captcha') return false;
  if (challenge.consumedAt || challenge.expiresAt.getTime() < Date.now()) return false;
  if (!challenge.ipHash || challenge.ipHash !== hashForStorage(ip)) return false;
  if (challenge.codeHash !== hashCode(answer)) {
    await prisma.verificationCode.updateMany({
      where: { id: challenge.id, consumedAt: null, attemptCount: { lt: 3 } },
      data: { attemptCount: { increment: 1 } },
    });
    await prisma.verificationCode.updateMany({
      where: { id: challenge.id, consumedAt: null, attemptCount: { gte: 3 } },
      data: { consumedAt: new Date() },
    });
    return false;
  }

  const consumed = await prisma.verificationCode.updateMany({
    where: {
      id: challenge.id,
      purpose: 'register_captcha',
      consumedAt: null,
      expiresAt: { gt: new Date() },
      ipHash: hashForStorage(ip),
      codeHash: hashCode(answer),
    },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}

export type EmailCodePurpose = 'register_email' | 'login_email' | 'password_reset';

export async function createEmailVerificationCode(
  email: string,
  ip: string,
  purpose: EmailCodePurpose = 'register_email'
) {
  const code = createNumericCode(6);
  const windowStart = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const ipHash = hashForStorage(ip);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-${purpose}-email:${email}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-${purpose}-ip:${ipHash}`}))`;
    const [emailCount, ipCount] = await Promise.all([
      tx.verificationCode.count({ where: { email, purpose, createdAt: { gte: windowStart } } }),
      tx.verificationCode.count({ where: { ipHash, purpose, createdAt: { gte: windowStart } } }),
    ]);
    if (emailCount >= 3) throw new Error('该邮箱验证码发送过于频繁，请稍后再试。');
    if (ipCount >= 5) throw new Error('当前网络请求验证码过于频繁，请稍后再试。');
    await tx.verificationCode.create({
      data: { email, codeHash: hashCode(code), purpose, expiresAt: new Date(Date.now() + 10 * 60 * 1000), ipHash },
    });
  });
  return code;
}

export async function verifyEmailCode(
  email: string,
  code: string,
  purpose: EmailCodePurpose = 'register_email'
) {
  const records = await prisma.verificationCode.findMany({
    where: {
      email,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  const matched = records.find((item) => item.codeHash === hashCode(code));
  if (matched) {
    const consumed = await prisma.verificationCode.updateMany({
      where: { id: matched.id, consumedAt: null, expiresAt: { gt: new Date() }, codeHash: hashCode(code) },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1;
  }
  await prisma.verificationCode.updateMany({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() }, attemptCount: { lt: 5 } },
    data: { attemptCount: { increment: 1 } },
  });
  await prisma.verificationCode.updateMany({
    where: { email, purpose, consumedAt: null, attemptCount: { gte: 5 } },
    data: { consumedAt: new Date() },
  });
  return false;
}

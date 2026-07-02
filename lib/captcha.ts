import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashForStorage } from '@/lib/rate-limit';

function hashCode(value: string) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function createNumericCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max));
}

export function buildCaptchaSvg(text: string) {
  const safeText = text.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="54" viewBox="0 0 160 54">
  <rect width="160" height="54" rx="10" fill="#eef2ff"/>
  <path d="M8 42 C36 12, 52 60, 78 26 S126 34, 152 12" fill="none" stroke="#a5b4fc" stroke-width="2" opacity="0.8"/>
  <path d="M12 16 H148 M18 38 H138" stroke="#c7d2fe" stroke-width="1" opacity="0.7"/>
  <text x="80" y="35" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" font-weight="800" fill="#312e81" letter-spacing="5">${safeText}</text>
</svg>`;
}

export async function createCaptchaChallenge(ip: string) {
  const code = createNumericCode(4);
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
    image: `data:image/svg+xml;base64,${Buffer.from(buildCaptchaSvg(code)).toString('base64')}`,
  };
}

export async function verifyCaptcha(challengeId: string, answer: string) {
  const challenge = await prisma.verificationCode.findUnique({
    where: { id: challengeId },
  });

  if (!challenge || challenge.purpose !== 'register_captcha') return false;
  if (challenge.consumedAt || challenge.expiresAt.getTime() < Date.now()) return false;
  if (challenge.codeHash !== hashCode(answer)) return false;

  await prisma.verificationCode.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });
  return true;
}

export async function createEmailVerificationCode(email: string, ip: string) {
  const code = createNumericCode(6);
  await prisma.verificationCode.create({
    data: {
      email,
      codeHash: hashCode(code),
      purpose: 'register_email',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      ipHash: hashForStorage(ip),
    },
  });
  return code;
}

export async function verifyEmailCode(email: string, code: string) {
  const records = await prisma.verificationCode.findMany({
    where: {
      email,
      purpose: 'register_email',
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  const matched = records.find((item) => item.codeHash === hashCode(code));
  if (!matched) return false;

  await prisma.verificationCode.update({
    where: { id: matched.id },
    data: { consumedAt: new Date() },
  });
  return true;
}


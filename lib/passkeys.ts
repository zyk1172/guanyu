import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { privacyHmacHash } from '@/lib/privacy-hash';
import { AccessError } from '@/lib/access';

export function passkeyRelyingParty() {
  // Never derive the RP or allowed origin from untrusted proxy/Host headers.
  const url = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new AccessError('通行密钥需要 HTTPS，请联系管理员配置网站地址。', 503);
  }
  return { origin: url.origin, rpID: url.hostname };
}

function cookieName(mode: 'register' | 'login') {
  return `${passkeyRelyingParty().origin.startsWith('https:') ? '__Host-' : ''}guanyu-passkey-${mode}`;
}

export async function issuePasskeyChallenge(response: NextResponse, challenge: string, mode: 'register' | 'login', user?: { id: string; sessionVersion: number }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.passkeyChallenge.create({ data: {
    tokenHash: privacyHmacHash(token), challenge, purpose: mode,
    userId: user?.id, sessionVersion: user?.sessionVersion,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  } });
  response.cookies.set(cookieName(mode), token, { httpOnly: true, secure: passkeyRelyingParty().origin.startsWith('https:'), sameSite: 'strict', path: '/', maxAge: 300 });
}

export async function consumePasskeyChallenge(request: NextRequest, mode: 'register' | 'login') {
  const token = request.cookies.get(cookieName(mode))?.value;
  if (!token || token.length > 100) throw new AccessError('验证已过期，请重新操作。', 401);
  const tokenHash = privacyHmacHash(token);
  // DELETE RETURNING makes each browser-bound challenge usable exactly once,
  // including concurrent verification requests and invalid assertions.
  const records = await prisma.$queryRaw<Array<{ challenge: string; userId: string | null; sessionVersion: number | null }>>`
    DELETE FROM "PasskeyChallenge" WHERE "tokenHash" = ${tokenHash} AND "purpose" = ${mode}
    AND "expiresAt" > NOW() RETURNING "challenge", "userId", "sessionVersion"`;
  if (!records[0]) throw new AccessError('验证已过期，请重新操作。', 401);
  return records[0];
}

export function clearPasskeyChallenge(response: NextResponse, mode: 'register' | 'login') {
  response.cookies.set(cookieName(mode), '', { httpOnly: true, secure: passkeyRelyingParty().origin.startsWith('https:'), sameSite: 'strict', path: '/', maxAge: 0 });
}

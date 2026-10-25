import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { createEmailVerificationCode } from '../lib/captcha';
import { privacyHmacHash } from '../lib/privacy-hash';
import { setSessionCookie } from '../lib/session-cookie';
import { consumePasskeyChallenge, issuePasskeyChallenge, passkeyRelyingParty } from '../lib/passkeys';
import { POST as access } from '../app/api/access/verify/route';
import { PATCH as profile } from '../app/api/account/profile/route';
import { PATCH as email } from '../app/api/account/email/route';
import { DELETE as removeKey } from '../app/api/account/passkeys/route';
import { POST as options } from '../app/api/passkeys/options/route';
import { POST as verify } from '../app/api/passkeys/verify/route';
import { POST as traffic } from '../app/api/traffic/route';
import { GET as stats } from '../app/api/admin/traffic/route';

const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const suffix = crypto.randomUUID();
const address = `access-smoke-${suffix}@example.test`;
const otherAddress = `other-${suffix}@example.test`;
const users: string[] = [];
const eventId = crypto.randomUUID();
const req = (path: string, body?: unknown, cookie?: string, method = 'POST', extra: Record<string, string> = {}) => new NextRequest(new URL(path, base), { method, headers: { origin: new URL(base).origin, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36', ...(cookie ? { cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const cookie = async (id: string, version = 1, recent = true) => {
  const response = NextResponse.json({});
  await setSessionCookie(response, { id, email: address, sessionVersion: version });
  if (recent) return response.cookies.getAll().map(item => `${item.name}=${item.value}`).join('; ');
  const value = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id, sessionVersion: version } });
  return `next-auth.session-token=${value}`;
};

try {
  const code = await createEmailVerificationCode(address, suffix, 'access_email');
  const first = await access(req('/api/access/verify', { email: address, code }));
  assert.equal(first.status, 200); assert.equal((await first.json()).url, '/account?setup=passkey');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: address } }); users.push(user.id);
  assert.equal(user.role, 'user'); assert.equal(user.password, '!passwordless');
  assert.equal((await access(req('/api/access/verify', { email: address, code }))).status, 401);
  const before = await prisma.pointTransaction.count({ where: { userId: user.id } });
  const nextCode = await createEmailVerificationCode(address, suffix, 'access_email');
  assert.equal((await access(req('/api/access/verify', { email: address, code: nextCode }))).status, 200);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: user.id } }), before, 'returning login must not re-grant bonus');
  const session = await cookie(user.id);
  assert.equal((await profile(req('/api/account/profile', { name: 'Smoke reader', gender: '', country: 'CN' }, session, 'PATCH'))).status, 200);
  assert.equal((await profile(req('/api/account/profile', { name: 'x', gender: '', country: '', role: 'super_admin' }, session, 'PATCH'))).status, 400);
  assert.equal((await profile(req('/api/account/profile', { name: '', gender: '', country: '' }, session, 'PATCH', { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await profile(req('/api/account/profile', { name: '', gender: '', country: '' }, undefined, 'PATCH'))).status, 401);

  const other = await prisma.user.create({ data: { email: otherAddress, password: '!passwordless' } }); users.push(other.id);
  const key = await prisma.passkey.create({ data: { userId: other.id, credentialId: suffix, publicKey: new Uint8Array([1]), name: 'other key' } });
  assert.equal((await removeKey(req('/api/account/passkeys', { id: key.id }, session, 'DELETE'))).status, 404);
  assert.ok(await prisma.passkey.findUnique({ where: { id: key.id } }));
  assert.equal((await options(req('/api/passkeys/options', { mode: 'register' }, await cookie(user.id, 1, false)))).status, 403);
  const registrationOptions = await options(req('/api/passkeys/options', { mode: 'register' }, session));
  assert.equal(registrationOptions.status, 200);
  assert.equal((await registrationOptions.json()).authenticatorSelection.residentKey, 'required');
  assert.equal(passkeyRelyingParty().rpID, new URL(base).hostname);
  const res = NextResponse.json({}); await issuePasskeyChallenge(res, 'challenge', 'login');
  const challengeCookie = res.cookies.getAll().map(item => `${item.name}=${item.value}`).join('; ');
  const attempts = await Promise.allSettled([consumePasskeyChallenge(req('/verify', {}, challengeCookie), 'login'), consumePasskeyChallenge(req('/verify', {}, challengeCookie), 'login')]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await verify(req('/api/passkeys/verify', { mode: 'login', response: { id: 'forged' } }))).status, 401);

  const event = { eventId, path: '/demo?email=private@example.test' };
  const view = await traffic(req('/api/traffic', event)); assert.equal(view.status, 204);
  const visitorCookie = view.cookies.getAll().map(item => `${item.name}=${item.value}`).join('; ');
  assert.equal((await traffic(req('/api/traffic', event, visitorCookie))).status, 204);
  assert.equal(await prisma.pageView.count({ where: { id: eventId } }), 1);
  assert.equal((await prisma.pageView.findUniqueOrThrow({ where: { id: eventId } })).path, '/demo');
  const ignored = crypto.randomUUID();
  await traffic(req('/api/traffic', { eventId: ignored, path: '/' }, visitorCookie, 'POST', { dnt: '1' }));
  await traffic(req('/api/traffic', { eventId: ignored, path: '/' }, visitorCookie, 'POST', { 'user-agent': 'Googlebot' }));
  await traffic(req('/api/traffic', { eventId: ignored, path: '/account' }, visitorCookie));
  assert.equal(await prisma.pageView.count({ where: { id: ignored } }), 0);
  assert.equal((await stats(req('/api/admin/traffic', undefined, session, 'GET'))).status, 403);
  assert.equal((await stats(req('/api/admin/traffic', undefined, undefined, 'GET'))).status, 401);

  const newAddress = `new-${suffix}@example.test`;
  const newCode = await createEmailVerificationCode(`${user.id}:${newAddress}`, suffix, 'change_email');
  assert.equal((await email(req('/api/account/email', { email: newAddress, code: '000000' }, session, 'PATCH'))).status, 400);
  assert.equal((await email(req('/api/account/email', { email: newAddress, code: newCode }, session, 'PATCH'))).status, 200);
  assert.equal((await profile(req('/api/account/profile', { name: '', gender: '', country: '' }, session, 'PATCH'))).status, 401);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } }); assert.equal(after.email, newAddress); assert.equal(after.creditBalanceCents, user.creditBalanceCents);
  console.log('access/account smoke passed: signup/login/replay/bonus/profile/origin/session/ownership/challenge/traffic/email change');
} finally {
  await prisma.pageView.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.verificationCode.deleteMany({ where: { OR: [{ email: { contains: suffix } }, { ipHash: privacyHmacHash(suffix) }] } });
  await prisma.$disconnect();
}

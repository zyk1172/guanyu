import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trafficPath, isTrafficBot, shanghaiDate, trafficWindow } from '../lib/traffic-core';
import { COUNTRY_CODES, profileSchema } from '../lib/profile';
import { verifyPassword } from '../lib/password-core.mjs';

test('traffic strips identifiers and secrets and excludes account/admin/API routes', () => {
  assert.equal(trafficPath('/login?email=secret@example.com#code'), '/login');
  assert.equal(trafficPath('/audits/private-report-id?token=secret'), '/audits/:id');
  for (const path of ['/account', '/account/extensions', '/admin', '/api/login', '//example.com', 'https://example.com/', '/unknown', null]) assert.equal(trafficPath(path), null);
});
test('traffic recognizes common crawlers without excluding normal browsers', () => {
  for (const ua of ['Googlebot', 'Bingbot', 'curl-monitor', 'HeadlessChrome', 'facebookexternalhit/preview', '']) assert.equal(isTrafficBot(ua), true);
  assert.equal(isTrafficBot('Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'), false);
});
test('traffic calendar is based on Shanghai midnight, including UTC/month/year boundaries', () => {
  const now = new Date('2026-12-31T16:01:00.000Z');
  assert.equal(shanghaiDate(now), '2027-01-01');
  assert.equal(trafficWindow(7, now).start.toISOString(), '2026-12-25T16:00:00.000Z');
  assert.equal(trafficWindow(1, now).start.toISOString(), '2026-12-31T16:00:00.000Z');
});
test('profile accepts optional data but rejects role/email injection, invalid regions and control text', () => {
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  assert.ok(profileSchema.safeParse({ name: '', gender: '', country: '' }).success);
  assert.ok(profileSchema.safeParse({ name: '新闻读者', gender: 'undisclosed', country: 'CN' }).success);
  for (const change of [{ name: 'a'.repeat(61) }, { name: 'name\nadmin' }, { country: 'XX' }, { gender: 'invalid' }, { role: 'super_admin' }, { email: 'attacker@example.com' }]) assert.equal(profileSchema.safeParse({ name: '', gender: '', country: '', ...change }).success, false);
});
test('passwordless sentinel cannot be used as a shared password', async () => {
  assert.equal((await verifyPassword('!passwordless', '!passwordless')).valid, false);
});

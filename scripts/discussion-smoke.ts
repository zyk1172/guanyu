import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { GET, PATCH, POST } from '../app/api/audits/[id]/discussion/route';
import { prisma } from '../lib/prisma';

const suffix = randomUUID();
const users: string[] = [];
try {
  const reader = await prisma.user.create({ data: {
    email: `discussion-${suffix}@example.test`, password: '!fixture', name: '读者昵称',
    image: 'data:image/webp;base64,UklGRg==', creditBalance: 4, creditBalanceCents: 400, creditBalanceAmount: 4,
  } });
  users.push(reader.id);
  const admin = await prisma.user.create({ data: { email: `discussion-admin-${suffix}@example.test`, password: '!fixture', role: 'super_admin' } });
  users.push(admin.id);
  const report = await prisma.audit.create({ data: {
    userId: reader.id, title: 'Discussion fixture', source: 'Fixture', publishedAt: '', originalContent: '', newsSummary: '',
    auditResultJson: '{}', analysisMode: 'deep', reasoningDepth: 'medium', modelName: 'fixture', isPublic: true,
  } });
  const legacy = await prisma.reportDiscussionMessage.create({ data: {
    reportId: report.id, userId: admin.id, idempotencyKey: randomUUID(), content: 'Legacy root',
  } });
  await prisma.reportDiscussionMessage.create({ data: {
    reportId: report.id, userId: admin.id, idempotencyKey: randomUUID(), content: 'Legacy reply', parentMessageId: legacy.id,
  } });

  const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost');
  const cookieName = base.protocol === 'https:' ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const token = (id: string) => encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id, sessionVersion: 1 } });
  const readerToken = await token(reader.id);
  const adminToken = await token(admin.id);
  const ctx = { params: Promise.resolve({ id: report.id }) };
  const request = (method: string, auth?: string, body?: object) => new NextRequest(new URL(`/api/audits/${report.id}/discussion`, base), {
    method, headers: { origin: base.origin, 'content-type': 'application/json', ...(auth ? { cookie: `${cookieName}=${auth}` } : {}) },
    body: body && JSON.stringify(body),
  });

  assert.equal((await POST(request('POST', undefined, { content: 'guest' }), ctx)).status, 401);
  async function post(content: string, target?: string, key = randomUUID()) {
    const response = await POST(request('POST', readerToken, { content, replyToMessageId: target, idempotencyKey: key }), ctx);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const root = (await post('Top-level message')).message;
  const reply = (await post('First reply', root.id)).message;
  const key = randomUUID();
  const [nested, retried] = await Promise.all([post('Reply to reply', reply.id, key), post('Reply to reply', reply.id, key)]);
  assert.equal(nested.message.id, retried.message.id);
  assert.equal(Number(nested.repeated) + Number(retried.repeated), 1);
  assert.equal(nested.message.parentMessageId, root.id);
  assert.equal(nested.message.replyToMessageId, reply.id);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: reader.id } }), 3);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).creditBalanceCents, 250);

  const response = await GET(request('GET'), ctx);
  const data = await response.json();
  const thread = data.messages.find((message: { id: string }) => message.id === root.id);
  assert.deepEqual(thread.replies.map((message: { id: string }) => message.id), [reply.id, nested.message.id]);
  assert.equal(thread.author.name, '读者昵称');
  assert.equal(thread.author.image, 'data:image/webp;base64,UklGRg==');
  assert.equal(thread.userId, undefined);
  assert.equal(thread.author.email, undefined);
  assert.equal(data.canPost, false);
  assert.equal(data.messages.find((message: { id: string }) => message.id === legacy.id).replies[0].replyToMessageId, legacy.id);

  const hidden = await PATCH(request('PATCH', adminToken, { action: 'hide', messageId: reply.id }), ctx);
  assert.equal(hidden.status, 200);
  const publicBoard = await (await GET(request('GET'), ctx)).json();
  const replies = publicBoard.messages.find((message: { id: string }) => message.id === root.id).replies;
  assert.deepEqual(replies.map((message: { id: string }) => message.id), [nested.message.id]);
  const blocked = await POST(request('POST', readerToken, { content: 'Hidden target', replyToMessageId: reply.id, idempotencyKey: randomUUID() }), ctx);
  assert.equal(blocked.status, 400);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: reader.id } }), 3);
  console.log('Discussion smoke passed: public profiles, legacy replies, reply targets, moderation and one charge per request.');
} finally {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
}

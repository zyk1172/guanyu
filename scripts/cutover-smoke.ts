import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { GET as manage } from '../app/api/audits/manage/route';
import { POST as batch } from '../app/api/audits/batch/route';
import { POST as complete } from '../app/api/audits/[id]/completion/route';
import { effectiveCreditCents } from '../lib/billing';
import { queueReportCompleted } from '../lib/email';
import { prisma } from '../lib/prisma';
import { beginServiceOperation, recoverExpiredServiceOperations } from '../lib/service-operation';

const secret = process.env.NEXTAUTH_SECRET!;
const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin;
const tag = randomUUID();
const users: string[] = [];

async function request(path: string, userId: string, body?: unknown) {
  const token = await encode({ secret, token: { id: userId, sessionVersion: 1 } });
  return new NextRequest(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers: { origin: base, cookie: `next-auth.session-token=${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

try {
  for (const role of ['user', 'super_admin']) {
    const user = await prisma.user.create({
      data: {
        email: `cutover-${role}-${tag}@example.test`, password: '!passwordless', role,
        creditBalance: 10, creditBalanceCents: 1000, creditBalanceAmount: 10,
      },
    });
    users.push(user.id);
  }
  const [owner, admin] = users;
  const createdAt = new Date();
  const sharedFields = {
    source: 'Fictional fixture',
    publishedAt: '',
    originalContent: 'The community library is testing longer hours. '.repeat(4),
    analysisMode: 'deep',
    reasoningDepth: 'medium',
    modelName: 'Fixture',
    newsSummary: 'Fixture summary.',
    auditResultJson: '{',
    createdAt,
  };
  await prisma.audit.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      ...sharedFields, userId: owner, title: `Cutover ${tag} ${i}`,
    })),
  });
  const foreign = await prisma.audit.create({ data: { ...sharedFields, userId: admin, title: 'Foreign fixture' } });
  const allIds = new Set<string>();
  let cursor: string | null = null;
  do {
    const search = new URLSearchParams({ scope: 'own', search: tag });
    if (cursor) search.set('cursor', cursor);
    const response = await manage(await request(`/api/audits/manage?${search}`, owner));
    assert.equal(response.status, 200);
    const data = await response.json();
    for (const row of data.items) {
      assert.equal(allIds.has(row.id), false);
      assert.equal('auditResultJson' in row || 'originalContent' in row, false);
      allIds.add(row.id);
    }
    cursor = data.nextCursor;
  } while (cursor);
  assert.equal(allIds.size, 101);
  assert.equal((await manage(await request('/api/audits/manage?scope=site', owner))).status, 403);

  const [auditId, nextId] = [...allIds];
  const publish = { scope: 'own', action: 'publish', ids: [auditId, auditId], requestId: randomUUID() };
  await prisma.audit.update({ where: { id: auditId }, data: { isSourcePublic: true, isCompletionPublic: true } });
  const denied = await batch(await request('/api/audits/batch', owner, { ...publish, ids: [auditId, foreign.id] }));
  assert.equal(denied.status, 404);
  assert.equal((await prisma.audit.findUniqueOrThrow({ where: { id: auditId } })).isPublic, false);
  for (let count = 0; count < 2; count++) {
    const response = await batch(await request('/api/audits/batch', owner, publish));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { changed: 1 });
  }
  assert.equal((await batch(await request('/api/audits/batch', owner, { ...publish, action: 'delete' }))).status, 409);
  const publicAudit = await prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
  assert.equal(publicAudit.isSourcePublic || publicAudit.isCompletionPublic || publicAudit.indexable, false);

  const completion = await complete(await request(`/api/audits/${auditId}/completion`, owner, { requestId: randomUUID() }),
    { params: Promise.resolve({ id: auditId }) });
  assert.equal(completion.status, 500);
  assert.equal(await prisma.serviceOperation.count({ where: { userId: owner } }), 0);
  assert.equal(effectiveCreditCents(await prisma.user.findUniqueOrThrow({ where: { id: owner } })), 1000);
  const { operation } = await beginServiceOperation({
    userId: owner, idempotencyKey: `completion:${nextId}:fixture`,
    operation: 'completion', reservedCredits: 200, transactionType: 'AI_COMPLETION',
    description: 'Cutover fixture', auditId: nextId,
  });
  await prisma.serviceOperation.update({ where: { id: operation.id }, data: { expiresAt: new Date(0) } });
  await Promise.all([recoverExpiredServiceOperations(), recoverExpiredServiceOperations()]);
  assert.equal(effectiveCreditCents(await prisma.user.findUniqueOrThrow({ where: { id: owner } })), 1000);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: owner, transactionType: 'FAILED_TASK_REFUND' } }), 1);

  await prisma.$transaction(tx => queueReportCompleted(tx, nextId));
  const notifications = await prisma.emailDelivery.findMany({ where: { auditId: nextId } });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].recipient, `cutover-user-${tag}@example.test`);
  assert.ok(notifications[0].payloadEncrypted);
  console.log('Cutover smoke passed: 101 same-time reports, ownership, atomic and idempotent batches, completion balance, one refund, author outbox.');
} finally {
  await prisma.emailDelivery.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
}

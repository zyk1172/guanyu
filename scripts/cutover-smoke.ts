import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { GET as manage } from '../app/api/audits/manage/route';
import { reserveAccessAttempt } from '../lib/access';
import { createAnalyzeJob } from '../lib/analyze-job';
import { issueEmailVerificationCode } from '../lib/captcha';
import { privacyHmacHash } from '../lib/privacy-hash';
import { getClientIp } from '../lib/rate-limit';
import { encryptSecret } from '../lib/secret';
import { POST as createJob } from '../app/api/analyze/jobs/route';
import { GET as quote } from '../app/api/billing/quote/route';
import { DELETE as deleteAudit, PATCH as patchAudit } from '../app/api/audits/[id]/route';
import { POST as loginCode } from '../app/api/login/send-code/route';
import { POST as passwordCode } from '../app/api/password/send-code/route';
import { POST as registerCode } from '../app/api/register/send-code/route';
import { POST as resetPassword } from '../app/api/password/reset/route';
import { POST as batch } from '../app/api/audits/batch/route';
import { POST as complete } from '../app/api/audits/[id]/completion/route';
import { effectiveCreditCents } from '../lib/billing';
import { queueReportCompleted } from '../lib/email';
import { prisma } from '../lib/prisma';
import { beginServiceOperation, failServiceOperation, recoverExpiredServiceOperations } from '../lib/service-operation';

const secret = process.env.NEXTAUTH_SECRET!;
const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000').origin;
const tag = randomUUID();
const users: string[] = [];
const auditContext = (id: string) => ({ params: Promise.resolve({ id }) });
let modelId: string | undefined;
const fixtureCodes = new Set<string>();

async function request(path: string, userId: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const token = await encode({ secret, token: { id: userId, sessionVersion: 1 } });
  return new NextRequest(new URL(path, base), {
    method,
    headers: { origin: base, cookie: `next-auth.session-token=${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function captchaRequest(path: string, userId: string, email: string) {
  const ip = getClientIp(await request(path, userId));
  const answer = 'review-fixture';
  const challenge = await prisma.verificationCode.create({
    data: {
      email: `captcha:${randomUUID()}`,
      purpose: 'register_captcha',
      codeHash: privacyHmacHash(answer),
      ipHash: privacyHmacHash(ip),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  fixtureCodes.add(challenge.email);
  return request(path, userId, { email, captchaId: challenge.id, captchaAnswer: answer });
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

  const detailsPath = `/api/audits/${auditId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await prisma.audit.update({
      where: { id: auditId }, data: { isPublic: true, indexable: true, isSourcePublic: true, isCompletionPublic: true },
    });
    const [withdrawal, update] = await Promise.all([
      batch(await request('/api/audits/batch', owner, { ...publish, action: 'unpublish', requestId: randomUUID() })),
      patchAudit(await request(detailsPath, owner, { indexable: true, isSourcePublic: true }, 'PATCH'), auditContext(auditId)),
    ]);
    assert.equal(withdrawal.status, 200);
    assert.equal(update.status, 200);
    const withdrawn = await prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
    assert.equal(withdrawn.isPublic || withdrawn.indexable || withdrawn.isSourcePublic || withdrawn.isCompletionPublic, false);
  }

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

  const coverage = await beginServiceOperation({
    userId: owner, idempotencyKey: `related-coverage:v1:${nextId}:fixture`,
    operation: 'followup', reservedCredits: 200, transactionType: 'AI_RELATED_COVERAGE',
    description: 'Cutover coverage fixture', auditId: nextId,
  });
  // Older running tasks relied on the idempotency prefix until they had persisted their first stage.
  await prisma.serviceOperation.update({ where: { id: coverage.operation.id }, data: { resultId: null } });
  const deletion = { scope: 'own', action: 'delete', ids: [auditId, nextId], requestId: randomUUID() };
  assert.equal((await batch(await request('/api/audits/batch', owner, deletion))).status, 409);
  assert.equal((await deleteAudit(await request(`/api/audits/${nextId}`, owner, undefined, 'DELETE'), auditContext(nextId))).status, 409);
  assert.equal(await prisma.audit.count({ where: { id: { in: [auditId, nextId] } } }), 2);
  await failServiceOperation(coverage.operation.id, coverage.operation.currentAttempt);
  const deleted = await prisma.audit.create({ data: { ...sharedFields, userId: owner, title: 'Deleted fixture' } });
  assert.equal((await deleteAudit(await request(`/api/audits/${deleted.id}`, owner, undefined, 'DELETE'), auditContext(deleted.id))).status, 200);
  await assert.rejects(beginServiceOperation({
    userId: owner, idempotencyKey: `related-coverage:v1:${deleted.id}:fixture`,
    operation: 'followup', reservedCredits: 200, transactionType: 'AI_RELATED_COVERAGE',
    description: 'Cutover deleted coverage fixture', auditId: deleted.id,
  }), { code: 'AUDIT_NOT_FOUND' });
  assert.equal(effectiveCreditCents(await prisma.user.findUniqueOrThrow({ where: { id: owner } })), 1000);

  const model = await prisma.platformModelConfig.create({ data: {
    configKey: `cutover-quote-${tag}`, displayName: 'Cutover model', modelId: 'fixture', baseUrl: 'https://example.test/v1',
    apiKeyEncrypted: encryptSecret('fixture-only'), creditMultiplierBps: 100,
  } });
  modelId = model.id;
  await prisma.userSettings.upsert({
    where: { userId: owner }, update: { modelSource: 'platform', defaultPlatformModelConfigId: model.id },
    create: { userId: owner, modelSource: 'platform', defaultPlatformModelConfigId: model.id },
  });
  const currentQuote = async () => {
    const response = await quote(await request('/api/billing/quote', owner));
    assert.equal(response.status, 200);
    return (await response.json()).prices.find((price: { operation: string }) => price.operation === 'analysis').confirmation;
  };
  const initialQuote = await currentQuote();
  const submit = {
    title: 'A fictional community library extends opening hours',
    source: 'Fictional test fixture',
    content: 'A local library trial extends opening hours for two weeks. The announcement described staffing needs and the expected daily schedule. Staff plan to collect feedback from readers before they consider a permanent change.',
    clientRequestId: randomUUID(),
  };
  await prisma.platformModelConfig.update({ where: { id: model.id }, data: { creditMultiplierBps: 200, configVersion: { increment: 1 } } });
  for (const quote of [undefined, initialQuote]) {
    const rejected = await createJob(await request('/api/analyze/jobs', owner, { ...submit, quote }));
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).code, 'ANALYSIS_QUOTE_CHANGED');
  }
  assert.equal(await prisma.auditJob.count({ where: { userId: owner } }), 0);
  const approved = await currentQuote();
  assert.equal(initialQuote.costCents, 300);
  assert.equal(approved.costCents, 600);
  const accepted = await createAnalyzeJob(owner, submit, submit.clientRequestId, approved);
  await prisma.platformModelConfig.update({ where: { id: model.id }, data: { configVersion: { increment: 1 } } });
  assert.equal((await createAnalyzeJob(owner, submit, submit.clientRequestId, approved)).id, accepted.id);
  await assert.rejects(createAnalyzeJob(owner, submit, randomUUID(), approved), { code: 'ANALYSIS_QUOTE_CHANGED' });

  await prisma.$transaction(tx => queueReportCompleted(tx, nextId));
  const notifications = await prisma.emailDelivery.findMany({ where: { auditId: nextId } });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].recipient, `cutover-user-${tag}@example.test`);
  assert.ok(notifications[0].payloadEncrypted);
  const email = `cutover-user-${tag}@example.test`;
  const absent = `cutover-missing-${tag}@example.test`;
  const ip = getClientIp(await request('/api/login/send-code', owner));
  const bucket = `access:legacy-email-code:${privacyHmacHash(ip)}`;
  fixtureCodes.add(bucket);
  const paths = [
    ['/api/login/send-code', loginCode],
    ['/api/password/send-code', passwordCode],
    ['/api/register/send-code', registerCode],
  ] as const;
  for (let attempt = 0; attempt < 5; attempt++) await reserveAccessAttempt('legacy-email-code', ip, 5);
  for (const [path, sendCode] of paths) {
    const known = await sendCode(await captchaRequest(path, owner, email));
    const unknown = await sendCode(await captchaRequest(path, owner, absent));
    assert.equal(known.status, 429);
    assert.equal(unknown.status, 429);
    assert.deepEqual(await known.json(), await unknown.json());
  }

  fixtureCodes.add(email);
  const reset = await issueEmailVerificationCode(email, ip, 'password_reset');
  const resetBody = { email, code: reset.code, password: 'Fixture-password-only-789', confirmPassword: 'Fixture-password-only-789' };
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  try {
    process.env.APP_ENCRYPTION_KEY = '';
    delete process.env.NEXTAUTH_SECRET;
    assert.equal((await resetPassword(await request('/api/password/reset', owner, resetBody))).status, 500);
  } finally {
    if (encryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = encryptionKey;
    process.env.NEXTAUTH_SECRET = secret;
  }
  assert.equal((await prisma.verificationCode.findUniqueOrThrow({ where: { id: reset.id } })).consumedAt, null);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner } })).sessionVersion, 1);
  assert.equal((await resetPassword(await request('/api/password/reset', owner, resetBody))).status, 200);
  assert.ok((await prisma.verificationCode.findUniqueOrThrow({ where: { id: reset.id } })).consumedAt);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner } })).sessionVersion, 2);
  console.log('Cutover smoke passed: pagination, authorization, concurrent withdrawal, blocked deletion, quote confirmation, single refund, author outbox, uniform code limits, and password reset rollback.');
} finally {
  await prisma.emailDelivery.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (modelId) await prisma.platformModelConfig.deleteMany({ where: { id: modelId } });
  await prisma.verificationCode.deleteMany({ where: { email: { in: [...fixtureCodes] } } });
  await prisma.$disconnect();
}

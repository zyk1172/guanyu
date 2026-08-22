import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYZE_ADMISSION_ACTION, ANALYZE_ADMISSION_LIMIT, getClientIp, shouldRejectAnalyzeAdmission } from '../lib/rate-limit';
import { publicAuditDto, ownerAuditDto } from '../lib/audit-dto';
import { serviceOperationChargeKey, serviceOperationRefundKey } from '../lib/service-operation';
import { sameOriginResponse } from '../lib/request-security';
import { assertValidPasswordInput, hashPassword, verifyPassword } from '../lib/password-core.mjs';
import { DELETE, PATCH } from '../app/api/audits/[id]/route';
import { normalizeOnlineVerification, normalizeSourceUrl, normalizeVerificationStatus } from '../app/api/analyze/route';

test('getClientIp reads record-style headers used by NextAuth authorize', () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    assert.equal(
      getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }),
      '1.2.3.4',
    );
    assert.equal(
      getClientIp({ headers: { 'X-Real-IP': '9.9.9.9' } }),
      '9.9.9.9',
    );
    assert.equal(
      getClientIp(new Request('http://localhost', { headers: { 'x-forwarded-for': '8.8.8.8' } })),
      '8.8.8.8',
    );
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
});

test('public audit DTO never leaks owner or internal snapshot fields', () => {
  const row = {
    id: 'a1',
    userId: 'u1',
    focus: 'private focus',
    platformModelConfigIdSnapshot: 'pm1',
    modelMultiplierBpsSnapshot: 100,
    modelConfigVersionSnapshot: 2,
    modelCreditCostCents: 300,
    title: 'T',
  };
  const dto: any = publicAuditDto(row);
  for (const key of ['userId', 'focus', 'platformModelConfigIdSnapshot', 'modelMultiplierBpsSnapshot', 'modelConfigVersionSnapshot', 'modelCreditCostCents']) {
    assert.equal(key in dto, false, `${key} should not leak`);
  }
  const owner: any = ownerAuditDto(row);
  assert.equal(owner.focus, 'private focus');
  assert.equal('userId' in owner, false);
});

test('public audit DTO never exposes private AI completion text', () => {
  const privateDto: any = publicAuditDto({ id: 'a1', isCompletionPublic: false, completionMarkdown: 'private completion' });
  assert.equal('completionMarkdown' in privateDto, false);

  const publicDto: any = publicAuditDto({ id: 'a1', isCompletionPublic: true, completionMarkdown: 'public completion' });
  assert.equal(publicDto.completionMarkdown, 'public completion');
});

test('service operation charge keys include attempt', () => {
  assert.notEqual(serviceOperationChargeKey('op1', 1), serviceOperationChargeKey('op1', 2));
  assert.notEqual(serviceOperationRefundKey('op1', 1), serviceOperationRefundKey('op1', 2));
  assert.notEqual(serviceOperationChargeKey('op1', 1), serviceOperationRefundKey('op1', 1));
});

test('synchronous and queued analysis share the same serialized admission policy', () => {
  assert.equal(ANALYZE_ADMISSION_ACTION, 'analyze_job');
  assert.equal(ANALYZE_ADMISSION_LIMIT, 3);
  assert.equal(shouldRejectAnalyzeAdmission(2), false);
  assert.equal(shouldRejectAnalyzeAdmission(3), true);
});

test('cookie-auth write helpers reject cross-site origins and allow same-origin requests', async () => {
  const crossSite = sameOriginResponse(new Request('https://guanyu.example/api/account/settings', {
    method: 'PATCH',
    headers: { origin: 'https://attacker.example' },
  }));
  assert.equal(crossSite?.status, 403);
  assert.equal((await crossSite?.json())?.code, 'CSRF_ORIGIN_MISMATCH');

  const sameSite = sameOriginResponse(new Request('https://guanyu.example/api/account/settings', {
    method: 'PATCH',
    headers: { origin: 'https://guanyu.example' },
  }));
  assert.equal(sameSite, null);
});

test('password validation counts Unicode characters and keeps the byte ceiling', async () => {
  assert.throws(() => assertValidPasswordInput('观隅安全'), /密码至少需要 8 个字符/);
  assert.doesNotThrow(() => assertValidPasswordInput('abcdefgh'));
  assert.doesNotThrow(() => assertValidPasswordInput('观隅新闻安全测试'));
  assert.doesNotThrow(() => assertValidPasswordInput('😀😀😀😀😀😀😀😀'));
  assert.throws(() => assertValidPasswordInput('a'.repeat(1025)), /密码不能超过 1024 个字节/);

  const stored = await hashPassword('abcdefgh');
  assert.deepEqual(await verifyPassword('a'.repeat(1025), stored), { valid: false, needsUpgrade: false });
});

test('audit PATCH and DELETE return the CSRF response before entering business error handling', async () => {
  const params = { params: Promise.resolve({ id: 'a1' }) };
  const patchResponse = await PATCH(new Request('https://guanyu.example/api/audits/a1', {
    method: 'PATCH',
    headers: { origin: 'https://attacker.example' },
  }), params);
  const deleteResponse = await DELETE(new Request('https://guanyu.example/api/audits/a1', {
    method: 'DELETE',
    headers: { origin: 'https://attacker.example' },
  }), params);
  assert.equal(patchResponse.status, 403);
  assert.equal((await patchResponse.json()).code, 'CSRF_ORIGIN_MISMATCH');
  assert.equal(deleteResponse.status, 403);
  assert.equal((await deleteResponse.json()).code, 'CSRF_ORIGIN_MISMATCH');
});

test('online verification only trusts observed source URLs', () => {
  const observed = [{ title: '真实来源', url: 'https://source.example/report/', snippet: 'source', provider: 'tavily' }];
  assert.equal(normalizeSourceUrl(' https://source.example/report/#fragment '), 'https://source.example/report');
  assert.equal(normalizeVerificationStatus('原文支持', true), 'source_supported');

  const normalized: any = normalizeOnlineVerification({ onlineVerification: {
    enabled: true,
    verifiedSources: [
      { title: '真实来源', url: 'https://source.example/report/#fragment', verificationStatus: '已核验' },
      { title: '模型伪造', url: 'https://fake.example/invented', verificationStatus: '已核验' },
    ],
    backgroundSources: [],
    pendingLeads: [],
  } }, observed as any, 'zh-CN');
  assert.deepEqual(normalized.verifiedSources.map((source: any) => source.url), ['https://source.example/report']);
  assert.equal(normalized.verifiedSources[0].verificationStatus, 'externally_verified');

  const backgroundOnly: any = normalizeOnlineVerification({ onlineVerification: {
    enabled: true,
    verifiedSources: [],
    backgroundSources: [{ title: '背景', url: 'https://source.example/report/', verificationStatus: '已核验' }],
    pendingLeads: [],
  } }, observed as any, 'zh-CN');
  assert.equal(backgroundOnly.verifiedSources.length, 0);
  assert.equal(backgroundOnly.backgroundSources[0].verificationStatus, 'source_supported');
  assert.equal(normalizeVerificationStatus('已核验', false), 'source_supported');
});

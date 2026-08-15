import assert from 'node:assert/strict';
import test from 'node:test';
import { getClientIp } from '../lib/rate-limit';
import { publicAuditDto, ownerAuditDto } from '../lib/audit-dto';
import { serviceOperationChargeKey, serviceOperationRefundKey } from '../lib/service-operation';

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

test('service operation charge keys include attempt', () => {
  assert.notEqual(serviceOperationChargeKey('op1', 1), serviceOperationChargeKey('op1', 2));
  assert.notEqual(serviceOperationRefundKey('op1', 1), serviceOperationRefundKey('op1', 2));
  assert.notEqual(serviceOperationChargeKey('op1', 1), serviceOperationRefundKey('op1', 1));
});

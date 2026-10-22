import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/prisma';
import { PATCH, GET } from '../app/api/account/settings/route';
import { POST as createModel, PATCH as updateModel } from '../app/api/admin/platform-models/route';
import { hashPassword } from '../lib/password-core.mjs';
import { decryptSecret } from '../lib/secret';
import { createOperationsBackup } from '../lib/operations-backup';
import { personalDeepseekSearchOptions, platformDeepseekSearchOptions } from '../lib/search-config';
import { platformModelSnapshot } from '../lib/platform-models';
import { resolveOperationModel } from '../lib/operation-model';

const ids: string[] = [];
let modelId = '';
const tag = randomUUID();
async function user(role: string, pro = false) {
  const value = await prisma.user.create({ data: { password: await hashPassword(randomUUID()), email: `deepseek-${role}-${pro}-${tag}@example.test`, role, proAccessExpiresAt: pro ? new Date(Date.now() + 86400_000) : null, settings: { create: { defaultModelName: 'fixture', llmBaseUrl: 'https://api.deepseek.com' } } } });
  ids.push(value.id); return value;
}
async function request(userId: string, path: string, body?: object, method: 'PATCH' | 'POST' = 'PATCH') {
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: userId, sessionVersion: 1 }, maxAge: 3600 });
  return new NextRequest(`http://localhost${path}`, { method: body ? method : 'GET', headers: { cookie: `next-auth.session-token=${token}`, origin: 'http://localhost', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
try {
  const admin = await user('super_admin'), pro = await user('user', true), ordinary = await user('user');
  const created = await createModel(await request(admin.id, '/api/admin/platform-models', { displayName: 'DeepSeek settings smoke fixture', modelId: 'fixture', baseUrl: 'https://api.deepseek.com', apiKey: 'model-fixture', searchMode: 'agent', searchProvider: 'deepseek', deepseekApiKey: 'admin-search-fixture' }, 'POST'));
  assert.equal(created.status, 201); const model = (await created.json()).model; modelId = model.id;
  assert.equal(model.hasDeepseekApiKey, true); assert.ok(!JSON.stringify(model).includes('admin-search-fixture')); assert.equal('deepseekApiKeyEncrypted' in model, false);
  const unchanged = await updateModel(await request(admin.id, '/api/admin/platform-models', { ...model, deepseekApiKey: '', action: 'update' })); assert.equal(unchanged.status, 200);
  assert.equal(decryptSecret((await prisma.platformModelConfig.findUniqueOrThrow({ where: { id: modelId } })).deepseekApiKeyEncrypted), 'admin-search-fixture');
  const fields = { modelSource: 'custom', defaultModelName: 'fixture', llmBaseUrl: 'https://api.deepseek.com', llmApiKey: 'personal-model-fixture', searchProvider: 'deepseek', deepseekApiKey: 'personal-search-fixture' };
  const forbidden = await PATCH(await request(ordinary.id, '/api/account/settings', fields)); assert.equal(forbidden.status, 403);
  const saved = await PATCH(await request(pro.id, '/api/account/settings', fields)); assert.equal(saved.status, 200);
  const safe = await saved.json(); assert.equal(safe.hasDeepseekApiKey, true); assert.equal(safe.searchProvider, 'deepseek'); assert.equal('deepseekApiKeyEncrypted' in safe, false); assert.ok(!JSON.stringify(safe).includes('personal-search-fixture'));
  const preserved = await PATCH(await request(pro.id, '/api/account/settings', { ...fields, deepseekApiKey: '' })); assert.equal(preserved.status, 200);
  const stored = await prisma.userSettings.findUniqueOrThrow({ where: { userId: pro.id } }); assert.equal(decryptSecret(stored.deepseekApiKeyEncrypted), 'personal-search-fixture');
  const fetched = await GET(await request(pro.id, '/api/account/settings')); assert.equal(fetched.status, 200); assert.equal((await fetched.json()).hasDeepseekApiKey, true);
  const { snapshot } = await createOperationsBackup();
  assert.ok(!JSON.stringify(snapshot.tables).includes(stored.deepseekApiKeyEncrypted!));
  assert.equal(snapshot.portableSecrets.userSettings.find(s => s.id === stored.id)?.deepseekApiKey, 'personal-search-fixture');
  assert.equal(snapshot.portableSecrets.platformModels?.find(s => s.id === modelId)?.deepseekApiKey, 'admin-search-fixture');
  const policyBefore = process.env.GUANYU_ALLOW_PAID_SEARCH; process.env.GUANYU_ALLOW_PAID_SEARCH = 'true';
  try {
    const runtime = await resolveOperationModel({ userId: pro.id, operation: 'followup' });
    assert.equal(runtime.searchOptions.provider, 'deepseek'); assert.equal(runtime.searchOptions.deepseekApiKey, 'personal-search-fixture');
    const config = await prisma.platformModelConfig.findUniqueOrThrow({ where: { id: modelId } });
    assert.equal((await platformDeepseekSearchOptions(platformModelSnapshot(config)))?.deepseekApiKey, 'admin-search-fixture');
  } finally { if (policyBefore === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = policyBefore; }
  const previous = process.env.GUANYU_ALLOW_PAID_SEARCH; process.env.GUANYU_ALLOW_PAID_SEARCH = 'false';
  try { assert.equal(personalDeepseekSearchOptions(stored), null); } finally { if (previous === undefined) delete process.env.GUANYU_ALLOW_PAID_SEARCH; else process.env.GUANYU_ALLOW_PAID_SEARCH = previous; }
  const cleared = await PATCH(await request(pro.id, '/api/account/settings', { ...fields, searchProvider: 'free', deepseekApiKey: '', clearDeepseekApiKey: true })); assert.equal(cleared.status, 200); assert.equal((await cleared.json()).hasDeepseekApiKey, false);
  assert.equal((await prisma.userSettings.findUniqueOrThrow({ where: { userId: pro.id } })).deepseekApiKeyEncrypted, null);
  const modelCleared = await updateModel(await request(admin.id, '/api/admin/platform-models', { ...model, deepseekApiKey: '', clearDeepseekApiKey: true, searchProvider: 'free' })); assert.equal(modelCleared.status, 200); assert.equal((await modelCleared.json()).model.hasDeepseekApiKey, false);
  console.log('DeepSeek settings smoke passed: Pro/admin saves, secret masking/preservation/clearing, ordinary-user denial, encrypted backup portability and deployment opt-out. No external API calls.');
} finally {
  if (modelId) await prisma.platformModelConfig.deleteMany({ where: { id: modelId } });
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

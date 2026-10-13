// Opt-in database integration smoke; run with the isolated test database.
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { GET } from '../app/api/billing/quote/route';
import { ensurePlatformModelBaseline } from '../lib/platform-models';

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.TEST_USER_EMAIL || 'ci-ordinary@example.com' } });
  const key = `quote-smoke-${Date.now()}`;
  const model = await prisma.platformModelConfig.create({ data: { configKey: key, displayName: 'Quote smoke', modelId: 'test', baseUrl: 'https://example.com', creditMultiplierBps: 150 } });
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  try {
    await prisma.userSettings.update({ where: { userId: user.id }, data: { modelSource: 'platform', defaultPlatformModelConfigId: model.id } });
    const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: user.id, email: user.email, sessionVersion: user.sessionVersion } });
    const response = await GET(new NextRequest('http://localhost/api/billing/quote', { headers: { cookie: `next-auth.session-token=${token}` } }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    const quote = await response.json();
    assert.deepEqual(quote.prices.map((p: { costCents: number }) => p.costCents), [450, 300, 150]);
    assert.equal(quote.exportCostCents, 100);
    assert.equal(quote.prices[0].available, false);
    assert.ok(!JSON.stringify(quote).includes('apiKey'));
    console.log('task quote smoke passed: server multiplier, all operation prices, export fee, missing credentials, no secrets');
    await Promise.all(Array.from({ length: 8 }, () => ensurePlatformModelBaseline()));
  } finally {
    await prisma.userSettings.update({ where: { userId: user.id }, data: { modelSource: settings?.modelSource || 'platform', defaultPlatformModelConfigId: settings?.defaultPlatformModelConfigId || null } });
    await prisma.platformModelConfig.delete({ where: { id: model.id } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

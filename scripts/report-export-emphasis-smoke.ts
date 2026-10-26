import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { getDemoReport } from '../lib/demo-report';
import { GET, POST } from '../app/api/audits/[id]/export/route';

const users: string[] = [];
try {
  const owner = await prisma.user.create({ data: { email: `export-emphasis-${crypto.randomUUID()}@example.test`, password: '!local-smoke-no-password-login!', creditBalance: 3, creditBalanceCents: 300, creditBalanceAmount: 3 } });
  users.push(owner.id);
  const other = await prisma.user.create({ data: { email: `export-other-${crypto.randomUUID()}@example.test`, password: '!local-smoke-no-password-login!' } });
  users.push(other.id);
  const demo = getDemoReport();
  const original = `${demo.originalContent}\n原文保留**字面星号**和链接 https://source.example/a?x=1&y=2`;
  const audit = await prisma.audit.create({ data: { userId: owner.id, title: '【虚构材料】导出重点格式验证', source: 'Local fictional fixture', publishedAt: '', originalContent: original, newsSummary: demo.report.newsSummary, auditResultJson: JSON.stringify(demo.report), modelName: 'local-static-fixture', reasoningDepth: 'medium', analysisMode: 'deep', reportLanguage: 'zh-CN', reportVersion: 1 } });
  const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost');
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: owner.id, sessionVersion: owner.sessionVersion } });
  const otherToken = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: other.id, sessionVersion: other.sessionVersion } });
  const cookieName = base.protocol === 'https:' ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const ctx = { params: Promise.resolve({ id: audit.id }) };
  const request = (format: string, method = 'POST', auth = token, origin = base.origin) => new NextRequest(new URL(`/api/audits/${audit.id}/export?format=${format}`, base), { method, headers: { origin, cookie: `${cookieName}=${auth}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ format }) } : {}) });
  const post = async (req: NextRequest) => { const response = await POST(req, ctx); assert.ok(response); return response; };
  const get = async (req: NextRequest) => { const response = await GET(req, ctx); assert.ok(response); return response; };
  const formats = ['PDF', 'WORD', 'MARKDOWN'] as const;
  const versions = { PDF: '8', WORD: '4', MARKDOWN: '3' };
  const oldVersions = { PDF: '7', WORD: '3', MARKDOWN: '2' };

  for (const format of formats) {
    const response = await post(request(format));
    assert.equal(response.status, 200, `${format}: ${await response.clone().text()}`);
    assert.equal((await response.json()).charged, true);
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).creditBalanceCents, 0);
  const ledger = await prisma.pointTransaction.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  assert.equal(ledger.length, 3);
  const originalReferences = new Map((await prisma.exportArtifact.findMany({ where: { reportId: audit.id } })).map(row => [row.exportFormat, row.pointTransactionId]));

  for (const format of formats) {
    const row = await prisma.exportArtifact.findUniqueOrThrow({ where: { userId_reportId_reportVersion_exportFormat: { userId: owner.id, reportId: audit.id, reportVersion: 1, exportFormat: format } } });
    await prisma.exportArtifact.update({ where: { id: row.id }, data: { templateVersion: oldVersions[format] } });
    assert.equal((await get(request(format, 'GET'))).status, 404, 'stale template must be regenerated');
    const refreshed = await post(request(format));
    assert.equal(refreshed.status, 200);
    assert.equal((await refreshed.json()).charged, false, 'layout upgrades are free at zero balance');
    const current = await prisma.exportArtifact.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(current.templateVersion, versions[format]);
    assert.equal(current.pointTransactionId, originalReferences.get(format));
    const download = await get(request(format, 'GET'));
    assert.equal(download.status, 200);
    const bytes = Buffer.from(await download.arrayBuffer());
    if (format === 'PDF') {
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      assert.match(bytes.toString('latin1'), /NotoSansSC-Regular/);
      assert.match(bytes.toString('latin1'), /NotoSansSC-Bold/);
    }
    if (format === 'WORD') assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    if (format === 'MARKDOWN') {
      assert.ok(bytes.toString().includes('**'));
      assert.ok(bytes.toString().endsWith(original), 'source appendix remains exact');
    }
    assert.equal((await (await post(request(format))).json()).charged, false, 'subsequent cache hit is free');
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).creditBalanceCents, 0);
  assert.deepEqual(await prisma.pointTransaction.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } }), ledger);
  assert.equal((await post(request('WORD', 'POST', otherToken))).status, 403);
  assert.equal((await get(request('WORD', 'GET', ''))).status, 401);
  assert.equal((await post(request('WORD', 'POST', token, 'https://foreign.example'))).status, 403);
  console.log('Report export smoke passed: real PDF/Word/Markdown, single first-export charges, zero-balance template refresh, unchanged ledger references, free cache reuse, original appendix preservation and owner/CSRF enforcement.');
} finally {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
}

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { PDFDocument, PDFName } from 'pdf-lib';
import { strFromU8, unzipSync } from 'fflate';
import { prisma } from '../lib/prisma';
import { getDemoReport } from '../lib/demo-report';
import { GET, POST } from '../app/api/audits/[id]/export/route';

const users: string[] = [];
try {
  const owner = await prisma.user.create({ data: { email: `export-emphasis-${crypto.randomUUID()}@example.test`, password: '!local-smoke-no-password-login!', creditBalance: 3, creditBalanceCents: 300, creditBalanceAmount: 3 } });
  users.push(owner.id);
  const other = await prisma.user.create({ data: { email: `export-other-${crypto.randomUUID()}@example.test`, password: '!local-smoke-no-password-login!', creditBalance: 1, creditBalanceCents: 100, creditBalanceAmount: 1 } });
  users.push(other.id);
  const demo = getDemoReport();
  const original = `${demo.originalContent}\nLoading...\nhide caption\n原文保留**字面星号**和链接 https://source.example/a?x=1&y=2`;
  const audit = await prisma.audit.create({ data: { userId: owner.id, title: '【虚构材料】导出重点格式验证', source: 'Local fictional fixture', publishedAt: '', originalContent: original, newsSummary: demo.report.newsSummary, auditResultJson: JSON.stringify(demo.report), modelName: 'local-static-fixture', reasoningDepth: 'medium', analysisMode: 'deep', reportLanguage: 'zh-CN', reportVersion: 1 } });
  const base = new URL(process.env.NEXTAUTH_URL || 'http://localhost');
  const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: owner.id, sessionVersion: owner.sessionVersion } });
  const otherToken = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: other.id, sessionVersion: other.sessionVersion } });
  const cookieName = base.protocol === 'https:' ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const ctx = { params: Promise.resolve({ id: audit.id }) };
  const request = (format: string, method = 'POST', auth = token, origin = base.origin, includeOriginal = false) => new NextRequest(new URL(`/api/audits/${audit.id}/export?format=${format}${includeOriginal ? '&original=1' : ''}`, base), { method, headers: { origin, cookie: `${cookieName}=${auth}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify({ format, includeOriginal }) } : {}) });
  const post = async (req: NextRequest) => { const response = await POST(req, ctx); assert.ok(response); return response; };
  const get = async (req: NextRequest) => { const response = await GET(req, ctx); assert.ok(response); return response; };
  const formats = ['PDF', 'WORD', 'MARKDOWN'] as const;
  const versions = { PDF: '10', WORD: '6', MARKDOWN: '5' };
  const oldVersions = { PDF: '9', WORD: '5', MARKDOWN: '4' };

  const concurrent = await Promise.all([
    post(request('WORD')),
    post(request('WORD', 'POST', token, base.origin, true)),
  ]);
  assert.ok(concurrent.every(response => response.status === 200));
  const variants = await Promise.all(concurrent.map(response => response.json()));
  assert.equal(variants.filter(item => item.charged).length, 1, 'concurrent variants are one purchase');
  assert.match(variants[1].downloadUrl, /original=1/);
  assert.equal(variants[0].filename, audit.title + '.docx');
  assert.equal(variants[1].filename, audit.title + ' - 含原文.docx');
  assert.equal((await get(request('WORD', 'GET', token, base.origin, true))).status, 200);

  for (const format of ['PDF', 'MARKDOWN']) {
    const response = await post(request(format));
    assert.equal(response.status, 200, `${format}: ${await response.clone().text()}`);
    assert.equal((await response.json()).charged, true);
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).creditBalanceCents, 0);
  const ledger = await prisma.pointTransaction.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
  assert.equal(ledger.length, 3);
  const where = { reportId: audit.id, includeOriginal: false };
  const originalReferences = new Map((await prisma.exportArtifact.findMany({ where })).map(row => [row.exportFormat, row.pointTransactionId]));
  assert.equal((await post(request('WORD', 'POST', otherToken))).status, 403);
  await prisma.reportFollowup.createMany({ data: [
    { id: crypto.randomUUID(), reportId: audit.id, reportVersion: 1, userId: owner.id, question: '这项核验材料是什么？', answer: '第一段。\n\n第二段：旧报告的**证据缺口**尚待核实。', sources: [{ title: '模拟原始文件', url: 'https://evidence.example/one', kind: 'page' }] },
    { id: crypto.randomUUID(), reportId: audit.id, reportVersion: 1, userId: owner.id, question: '无效的历史追问', answer: '< | | DSML | | calls>' },
    { id: crypto.randomUUID(), reportId: audit.id, reportVersion: 1, userId: other.id, question: '他人的私有问题', answer: '他人的私有回答' },
    { id: crypto.randomUUID(), reportId: audit.id, reportVersion: 2, userId: owner.id, question: '其他报告版本问题', answer: '其他报告版本的回答' },
  ] });

  for (const format of formats) {
    const row = await prisma.exportArtifact.findUniqueOrThrow({ where: { userId_reportId_reportVersion_exportFormat_includeOriginal: { userId: owner.id, reportId: audit.id, reportVersion: 1, exportFormat: format, includeOriginal: false } } });
    await prisma.exportArtifact.update({ where: { id: row.id }, data: { downloadFilename: 'stale-name.bin' } });
    const cachedResponse = await get(request(format, 'GET'));
    const extension = { PDF: '.pdf', WORD: '.docx', MARKDOWN: '.md' }[format];
    assert.equal(decodeURIComponent(cachedResponse.headers.get('Content-Disposition')!.split("UTF-8''")[1]), audit.title + extension);
    await prisma.exportArtifact.update({ where: { id: row.id }, data: { templateVersion: oldVersions[format] } });
    assert.equal((await get(request(format, 'GET'))).status, 404, 'stale template must be regenerated');
    const refreshed = await post(request(format));
    assert.equal(refreshed.status, 200);
    assert.equal((await refreshed.json()).charged, false, 'layout upgrades are free at zero balance');
    const current = await prisma.exportArtifact.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(current.templateVersion, versions[format]);
    assert.notEqual(current.snapshotHash, row.snapshotHash, 'completed follow-ups change the export snapshot');
    assert.equal(current.pointTransactionId, originalReferences.get(format));
    const download = await get(request(format, 'GET'));
    assert.equal(download.status, 200);
    const bytes = Buffer.from(await download.arrayBuffer());
    if (format === 'PDF') {
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      assert.match(bytes.toString('latin1'), /NotoSansSC-Regular/);
      assert.match(bytes.toString('latin1'), /NotoSansSC-Bold/);
      const pdf = await PDFDocument.load(bytes);
      assert.ok(pdf.getPageCount() <= 6, 'the compact fixture gains a contents page without extra footer pages');
      assert.ok(pdf.catalog.has(PDFName.of('Outlines')));
      assert.ok((pdf.getPage(0).node.Annots()?.size() || 0) >= 4, 'the contents page links to the report chapters');
    }
    if (format === 'WORD') {
      const documentXml = unzipSync(bytes)['word/document.xml'];
      assert.ok(documentXml, 'the Word archive contains its document XML');
      const xml = strFromU8(documentXml);
      assert.match(xml, /w:anchor="section_1"/);
      assert.match(xml, /w:name="section_1"/);
      assert.match(xml, /w:val="Subtitle"/);
      assert.match(xml, /w:val="Heading1"/);
      assert.match(xml, /w:val="Heading2"/);
    }
    if (format === 'MARKDOWN') {
      assert.ok(bytes.toString().includes('**'));
      const markdown = bytes.toString();
      assert.match(markdown, /## \d+\. 已完成追问/);
      assert.match(markdown, /这项核验材料是什么？/);
      assert.match(markdown, /第二段/);
      assert.match(markdown, /https:\/\/evidence\.example\/one/);
      assert.match(markdown, /核心指标与评分理由/);
      assert.match(markdown, /证据等级分布/);
      assert.doesNotMatch(markdown, /他们的私有|他人的私有|其他报告版本|无效的历史追问|DSML|附录：新闻原文|externally_verified|pending_verification/);
      const originalVariant = await post(request(format, 'POST', token, base.origin, true));
      assert.equal(originalVariant.status, 200);
      const { content, charged } = await originalVariant.json();
      assert.equal(charged, false);
      assert.match(content, /附录：新闻原文/);
      assert.doesNotMatch(content, /Loading\.\.\.|hide caption/);
      assert.ok(content.endsWith('原文保留**字面星号**和链接 https://source.example/a?x=1&y=2'));
    }
    assert.equal((await (await post(request(format))).json()).charged, false, 'subsequent cache hit is free');
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).creditBalanceCents, 0);
  assert.deepEqual(await prisma.pointTransaction.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } }), ledger);
  await prisma.reportFollowup.create({ data: { id: crypto.randomUUID(), reportId: audit.id, reportVersion: 1, userId: owner.id, question: '追加的第二次追问', answer: '更新后无需再付费' } });
  const newer = await post(request('MARKDOWN'));
  const newerData = await newer.json();
  assert.equal(newer.status, 200);
  assert.equal(newerData.charged, false);
  assert.match(newerData.content, /追加的第二次追问/);
  assert.equal(await prisma.pointTransaction.count({ where: { userId: owner.id } }), 3);
  await prisma.user.update({ where: { id: other.id }, data: { role: 'super_admin' } });
  const adminExport = await post(request('MARKDOWN', 'POST', otherToken));
  assert.equal(adminExport.status, 200);
  const adminMarkdown = (await adminExport.json()).content;
  assert.match(adminMarkdown, /他人的私有回答/);
  assert.doesNotMatch(adminMarkdown, /这项核验材料是什么|追加的第二次追问/);
  assert.equal((await get(request('WORD', 'GET', ''))).status, 401);
  assert.equal((await post(request('WORD', 'POST', token, 'https://foreign.example'))).status, 403);
  console.log('Report export smoke passed: real PDF/Word/Markdown, single first-export charges, zero-balance template refresh, unchanged ledger references, free cache reuse, appendix variants and cleanup, follow-up revisions, account isolation and owner/CSRF enforcement.');
} finally {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
}

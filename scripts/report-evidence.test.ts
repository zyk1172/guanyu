import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceUrl, normalizeEvidenceReferences } from '../lib/report-evidence';
import { ownerAuditDto, publicAuditDto } from '../lib/audit-dto';
import { hasUnexpectedReportProse } from '../lib/report-language-core.mjs';

test('only exact article excerpts and supplied HTTP sources become evidence references', () => {
  const result = normalizeEvidenceReferences({ originalQuote: 'The survey covered 200 people.', sourceUrls: ['https://example.com/data#table', 'https://invented.example/claim', 'javascript:alert(1)'] }, 'Article: The survey covered\n200 people. Details follow.', [{ url: 'https://example.com/data' }]);
  assert.equal(result.originalQuote, 'The survey covered 200 people.');
  assert.deepEqual(result.sourceUrls, ['https://example.com/data']);
  assert.equal(normalizeEvidenceReferences({ originalQuote: 'The survey proves causation.' }, 'The survey covered 200 people.', []).originalQuote, undefined);
});

test('legacy reports have no fabricated references and unsafe URLs are rejected', () => {
  assert.deepEqual(normalizeEvidenceReferences({}, '', []), { originalQuote: undefined, sourceUrls: [] });
  for (const value of ['data:text/html,x', 'file:///tmp/a', 'https://user:password@example.com/a', 'not a URL']) assert.equal(evidenceUrl(value), null);
});

test('original quotations retain their source language without bypassing narrative language checks', () => {
  assert.equal(hasUnexpectedReportProse({ newsSummary: 'Summary', keyFindings: [{ originalQuote: '原文保留中文引语，不应翻译。' }] }, 'en-US'), false);
  assert.equal(hasUnexpectedReportProse({ newsSummary: '摘要不应为中文' }, 'en-US'), true);
});

test('private source excerpts remain visible to owners but are removed from public DTOs', () => {
  const audit = { isSourcePublic: false, originalContent: 'private source', auditResultJson: JSON.stringify({ keyFindings: [{ title: 'Finding', originalQuote: 'private source' }] }) };
  assert.equal(JSON.parse(publicAuditDto(audit).auditResultJson).keyFindings[0].originalQuote, undefined);
  assert.equal(JSON.parse(ownerAuditDto(audit).auditResultJson).keyFindings[0].originalQuote, 'private source');
  assert.equal(JSON.parse(publicAuditDto({ ...audit, isSourcePublic: true }).auditResultJson).keyFindings[0].originalQuote, 'private source');
});

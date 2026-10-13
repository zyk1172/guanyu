import assert from 'node:assert/strict';
import test from 'node:test';
import { getDemoReport } from '../lib/demo-report';
import { ReportSchema } from '../lib/report-schema';
import { normalizeEvidenceReferences } from '../lib/report-evidence';

test('static examples are valid, explicitly fictional, offline and traceable to supplied text', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    const { report, originalContent } = getDemoReport(locale);
    assert.equal(ReportSchema.safeParse(report).success, true);
    assert.equal(report.onlineVerification.enabled, false);
    assert.deepEqual(report.onlineVerification.verifiedSources, []);
    assert.match(originalContent, /虚构|Fictional/);
    const references = normalizeEvidenceReferences(report.keyFindings[0], originalContent, []);
    assert.equal(references.originalQuote, report.keyFindings[0].originalQuote);
    assert.deepEqual(references.sourceUrls, []);
  }
});

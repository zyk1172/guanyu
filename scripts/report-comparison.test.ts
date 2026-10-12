import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonIdsSchema, comparisonReport, comparisonSchema, comparisonModelContext } from '../lib/report-comparison';
import { reportIdFromReference } from '../lib/report-reference';

const summary = { text: 'Compare available evidence.', reportRefs: [1, 2] };
const valid = { summary, sharedClaims: [summary], differences: [], gaps: [], nextChecks: [] };

test('comparison accepts 2–3 distinct IDs and only report links from the current site', () => {
  assert.equal(comparisonIdsSchema.safeParse(['a', 'b']).success, true);
  for (const ids of [['a'], ['a', 'a'], ['a', 'b', 'c', 'd']]) assert.equal(comparisonIdsSchema.safeParse(ids).success, false);
  assert.equal(reportIdFromReference('https://example.com/audits/a', 'https://example.com'), 'a');
  assert.equal(reportIdFromReference('https://other.example/audits/a', 'https://example.com'), null);
  assert.equal(reportIdFromReference('javascript:alert(1)', 'https://example.com'), null);
});

test('synthesis rejects nonexistent, repeated and single-report shared-claim references', () => {
  assert.equal(comparisonSchema(2).safeParse(valid).success, true);
  for (const refs of [[3], [1, 1], [1]]) assert.equal(comparisonSchema(2).safeParse({ ...valid, sharedClaims: [{ text: 'Claim', reportRefs: refs }] }).success, false);
});

test('legacy or damaged reports show missing material rather than invented findings', () => {
  const empty = comparisonReport({ id: 'a', title: 'Article', source: '', publishedAt: '', auditResultJson: 'invalid' });
  assert.deepEqual(empty.claims, []);
  assert.deepEqual(empty.sources, []);
  assert.equal(empty.conclusion, '');
  const legacy = comparisonReport({ id: 'b', title: 'Legacy', source: '', publishedAt: '', auditResultJson: JSON.stringify({ one_sentence_conclusion: 'Needs evidence', nine_mirror_review: { atomic_claims: [{ claim: 'Claim' }] } }) });
  assert.deepEqual(legacy.claims, ['Claim']);
});

test('model snapshots have bounded context and omit full originals and source URL bulk', () => {
  const report = comparisonReport({ id: 'a', title: 'x'.repeat(300), source: 'x'.repeat(300), publishedAt: '', auditResultJson: JSON.stringify({ oneSentenceConclusion: 'x'.repeat(5000), sourceInterpretation: { coreClaims: Array(10).fill('x'.repeat(5000)) }, informationGaps: Array(10).fill({ title: 'x'.repeat(300), description: 'x'.repeat(5000), nextVerification: 'x'.repeat(5000) }), keyFindings: Array(10).fill({ title: 'x'.repeat(300), content: 'x'.repeat(5000) }), verificationRoadmap: Array(10).fill({ question: 'x'.repeat(5000) }) }) });
  const context = comparisonModelContext([report, report, report]);
  assert.ok(JSON.stringify(context).length < 25000);
  assert.deepEqual(context.map((item) => item.number), [1, 2, 3]);
  assert.ok(context.every((item) => item.abridged));
});

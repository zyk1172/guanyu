import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANALYSIS_DRAFT_TTL, decodeAnalysisDraft, encodeAnalysisDraft, type AnalysisDraft } from '../lib/analysis-draft';

const draft: AnalysisDraft = { title: '新闻标题', source: '来源', content: '新闻正文'.repeat(30), focus: '证据', urlInput: 'https://example.com/news', parsedSourceUrl: '', inputMode: 'url' };
const now = 100000000;

test('authentication hand-off preserves material and input mode, without extra fields', () => {
  const encoded = encodeAnalysisDraft({ ...draft, apiKey: 'must-not-persist' } as AnalysisDraft, now);
  assert.deepEqual(decodeAnalysisDraft(encoded, now + 1000), draft);
  assert.ok(!encoded.includes('must-not-persist'));
});

test('expired, future-dated and malformed drafts cannot be restored', () => {
  assert.equal(decodeAnalysisDraft(encodeAnalysisDraft(draft, now), now + ANALYSIS_DRAFT_TTL), null);
  assert.equal(decodeAnalysisDraft(encodeAnalysisDraft(draft, now + 60001), now), null);
  for (const raw of [null, 'broken', '{}', 'null', JSON.stringify({ ...draft, savedAt: now, content: 123 }), JSON.stringify({ ...draft, savedAt: now, inputMode: 'other' })]) assert.equal(decodeAnalysisDraft(raw, now), null);
});

test('storage hand-off has bounded fields and restores only valid-sized content', () => {
  const encoded = encodeAnalysisDraft({ ...draft, content: '字'.repeat(40000), title: 'x'.repeat(1000) }, now);
  assert.equal(decodeAnalysisDraft(encoded, now)?.content.length, 30000);
  assert.equal(decodeAnalysisDraft(encoded, now)?.title.length, 500);
  assert.equal(decodeAnalysisDraft(JSON.stringify({ ...draft, savedAt: now, content: 'x'.repeat(30001) }), now), null);
});

test('valid long material survives JSON escaping across login', () => {
  const escaped = { ...draft, content: '\n"\\'.repeat(10000) };
  assert.deepEqual(decodeAnalysisDraft(encodeAnalysisDraft(escaped, now), now), escaped);
});

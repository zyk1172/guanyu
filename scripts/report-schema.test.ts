import assert from 'node:assert/strict';
import test from 'node:test';
import { ReportSchema } from '../lib/report-schema';
import { checkAnalysisOutput } from '../lib/analysis-output';
import type { ModelInvocationResult } from '../lib/model-runtime';

const validCore = {
  reportType: 'deep',
  newsSummary: '新闻摘要。',
  oneSentenceConclusion: '仍需核验关键数据。',
  readingValueReason: '该报道提供了新的信息，但证据状态仍需单独审慎阅读。',
  readingUtility: {
    publicImportance: 70,
    informationGain: 60,
    uniqueness: 50,
    explanatoryDepth: 55,
    actionability: 45,
    informationDensity: 65,
  },
  scores: {
    credibility: 60,
    informationCompleteness: 50,
    narrativeBias: 45,
    evidenceStrength: 55,
    speculationRisk: 40,
  },
  scoreReasons: {
    credibility: '原文主要事实可定位。',
    informationCompleteness: '关键背景仍有缺口。',
    narrativeBias: '标题和引语有明显侧重。',
    evidenceStrength: '已有部分可核验材料。',
    speculationRisk: '因果关系仍需验证。',
  },
};

test('report schema accepts a complete numeric contract', () => {
  assert.equal(ReportSchema.safeParse(validCore).success, true);
});

test('report schema rejects missing scores instead of creating defaults', () => {
  const missingScore = structuredClone(validCore) as any;
  delete missingScore.scores.evidenceStrength;
  assert.equal(ReportSchema.safeParse(missingScore).success, false);
});

test('report schema rejects non-integer and out-of-range scores', () => {
  const invalidScore = structuredClone(validCore) as any;
  invalidScore.scores.credibility = 60.5;
  assert.equal(ReportSchema.safeParse(invalidScore).success, false);
  invalidScore.scores.credibility = 101;
  assert.equal(ReportSchema.safeParse(invalidScore).success, false);
});

test('analysis retries invalid model outputs while preserving definite input errors', () => {
  const content = 'The city published a report on train service.';
  const assessment = { status: 'usable', evidence: 'The city published a report' };
  const result = (message: string): ModelInvocationResult => ({
    ok: true, status: 200, message, usedTokenBudget: false, sources: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, nativeSearchRequests: 0 },
  });
  assert.equal(checkAnalysisOutput(result(''), content).ok, false);
  assert.deepEqual(checkAnalysisOutput(result('{'), content), { ok: false, code: 'invalid_json', retry: true });
  assert.deepEqual(checkAnalysisOutput(result(JSON.stringify({ inputAssessment: assessment })), content), {
    ok: false, code: 'model_output_schema_invalid', retry: true,
  });
  const wrongArticle = checkAnalysisOutput(result(JSON.stringify({ inputAssessment: { status: 'title_mismatch', evidence: '' } })), content);
  assert.ok(!wrongArticle.ok);
  assert.equal(wrongArticle.retry, false);
  assert.equal(wrongArticle.code, 'ARTICLE_TITLE_MISMATCH');
  assert.equal(checkAnalysisOutput(result(JSON.stringify({ ...validCore, inputAssessment: assessment })), content).ok, true);
});

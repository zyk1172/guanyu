import assert from 'node:assert/strict';
import test from 'node:test';
import { ReportSchema } from '../lib/report-schema';

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

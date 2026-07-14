import { computeReadWorthCore } from './read-worth-core.mjs';

const OUTCOMES = new Set(['verified', 'unverified']);

function clamp(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function pickScores(report = {}) {
  const scores = report.scores || {};
  const legacy = report.score_summary || {};
  return {
    credibility: clamp(scores.credibility ?? legacy.credibility_score),
    informationCompleteness: clamp(scores.informationCompleteness ?? legacy.information_completeness_score),
    narrativeBias: clamp(scores.narrativeBias ?? legacy.narrative_bias_score),
    evidenceStrength: clamp(scores.evidenceStrength ?? legacy.evidence_strength_score),
    speculationRisk: clamp(scores.speculationRisk ?? legacy.speculation_risk_score),
  };
}

function roadmapFor(report = {}) {
  if (Array.isArray(report.verificationRoadmap)) return report.verificationRoadmap;
  if (Array.isArray(report?.nine_mirror_review?.verification_roadmap)) {
    return report.nine_mirror_review.verification_roadmap.map((item = {}) => ({
      question: String(item.question || item.target || ''),
      materialType: item.materialType || item.material_type || '多源报道',
      whyItMatters: item.whyItMatters || item.why_needed || '',
      priority: item.priority || '中',
    }));
  }
  return [];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function outcomeNote(record, language) {
  const chinese = String(language || '').startsWith('zh');
  if (record.outcome === 'verified') {
    return chinese
      ? `用户核验标记：已找到可核验材料（尚未附来源链接）— ${record.question}`
      : `User verification mark: material was found for checking (no source link attached) — ${record.question}`;
  }
  return chinese
    ? `用户核验标记：搜索后暂未找到可核验材料 — ${record.question}`
    : `User verification mark: no checkable material was found after search — ${record.question}`;
}

function reasonText(records, language) {
  const chinese = String(language || '').startsWith('zh');
  const verified = records.filter((item) => item.outcome === 'verified').length;
  const unverified = records.length - verified;
  if (chinese) {
    return `已根据 ${records.length} 条用户核验标记重新计算：${verified} 条标记为已找到可核验材料，${unverified} 条标记为暂未找到可核验材料。分数反映当前证据进度，不等同于新闻最终真伪判断。`;
  }
  return `Recalculated from ${records.length} user verification marks: ${verified} marked as checkable material found and ${unverified} as not found. Scores reflect the current evidence progress, not a final truth judgment.`;
}

export function applyManualVerification(report, { index, outcome, updatedAt = new Date().toISOString() } = {}) {
  if (!OUTCOMES.has(outcome)) throw new Error('核验结论无效。');

  const next = structuredClone(report || {});
  const roadmap = roadmapFor(next);
  if (!Number.isInteger(index) || index < 0 || index >= roadmap.length) {
    throw new Error('验证路线图项目不存在。');
  }

  // Keep an immutable score baseline so changing a selection never compounds prior adjustments.
  const baseline = next.manualVerificationBaseline || pickScores(next);
  const question = String(roadmap[index]?.question || `验证项目 ${index + 1}`).trim();
  const records = Array.isArray(next.manualVerifications)
    ? next.manualVerifications.filter((item) => Number.isInteger(item?.index) && item.index >= 0 && item.index < roadmap.length)
    : [];
  const nextRecord = { index, question, outcome, updatedAt };
  const remaining = records.filter((item) => item.index !== index);
  const manualVerifications = [...remaining, nextRecord].sort((left, right) => left.index - right.index);
  const verifiedCount = manualVerifications.filter((item) => item.outcome === 'verified').length;
  const unverifiedCount = manualVerifications.length - verifiedCount;

  const scores = {
    credibility: clamp(baseline.credibility + verifiedCount - unverifiedCount),
    informationCompleteness: clamp(baseline.informationCompleteness + verifiedCount * 2 - unverifiedCount * 2),
    narrativeBias: clamp(baseline.narrativeBias + unverifiedCount),
    evidenceStrength: clamp(baseline.evidenceStrength + verifiedCount * 3 - unverifiedCount * 2),
    speculationRisk: clamp(baseline.speculationRisk - verifiedCount * 3 + unverifiedCount * 3),
  };
  const readWorth = computeReadWorthCore({ scores });
  const language = next?.meta?.reportLanguage || next.reportLanguage || 'zh-CN';
  const notes = manualVerifications.map((item) => outcomeNote(item, language));

  next.verificationRoadmap = roadmap;
  next.manualVerificationBaseline = baseline;
  next.manualVerifications = manualVerifications;
  next.manualVerificationNotes = notes;
  next.scores = scores;
  next.readingValue = readWorth.label;
  next.read_worth = readWorth;
  next.readingValueReason = reasonText(manualVerifications, language);

  if (next.score_summary) {
    next.score_summary = {
      ...next.score_summary,
      credibility_score: scores.credibility,
      information_completeness_score: scores.informationCompleteness,
      narrative_bias_score: scores.narrativeBias,
      evidence_strength_score: scores.evidenceStrength,
      speculation_risk_score: scores.speculationRisk,
    };
  }

  if (next.evidenceVerificationSummary) {
    const summary = next.evidenceVerificationSummary;
    const manualPrefix = String(language).startsWith('zh') ? '用户核验标记：' : 'User verification mark:';
    summary.pendingVerificationClaims = (summary.pendingVerificationClaims || []).filter((item) => !String(item).startsWith(manualPrefix));
    summary.unableToVerifyClaims = (summary.unableToVerifyClaims || []).filter((item) => !String(item).startsWith(manualPrefix));
    summary.pendingVerificationClaims = unique([
      ...summary.pendingVerificationClaims,
      ...notes.filter((note) => note.includes(String(language).startsWith('zh') ? '已找到' : 'material was found')),
    ]);
    summary.unableToVerifyClaims = unique([
      ...summary.unableToVerifyClaims,
      ...notes.filter((note) => note.includes(String(language).startsWith('zh') ? '暂未找到' : 'no checkable material')),
    ]);
  }

  return { report: next, scores, readingValue: readWorth.label, records: manualVerifications };
}

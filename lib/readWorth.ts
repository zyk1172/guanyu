import { AnalysisResult, EvidenceGrade, ReadWorthLabel, ReadWorthVerdict } from './types';

function clamp(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function gradeWeight(grade: EvidenceGrade) {
  switch (grade) {
    case 'A': return 100;
    case 'B': return 82;
    case 'C': return 62;
    case 'D': return 34;
    case 'E': return 12;
    default: return 34;
  }
}

function riskPenalty(risk?: string) {
  if (risk === '高') return 10;
  if (risk === '低') return -2;
  return 4;
}

function verdictFromScore(score: number, fatalWeakness: boolean, strongGate: boolean): ReadWorthLabel {
  if (fatalWeakness || score < 45) return '狗屁不通';
  if (strongGate && score >= 82) return '上好佳作';
  if (score >= 64) return '值得一读';
  return '勉强一看';
}

export function computeReadWorth(result: AnalysisResult): ReadWorthVerdict {
  const scores = result.score_summary;
  const credibility = clamp(scores?.credibility_score ?? 50);
  const completeness = clamp(scores?.information_completeness_score ?? 50);
  const bias = clamp(scores?.narrative_bias_score ?? 50);
  const evidence = clamp(scores?.evidence_strength_score ?? 50);
  const speculation = clamp(scores?.speculation_risk_score ?? 50);
  const nine = result.nine_mirror_review;

  const baseScore = (
    credibility * 0.28 +
    evidence * 0.24 +
    completeness * 0.18 +
    (100 - bias) * 0.15 +
    (100 - speculation) * 0.15
  );

  const evidenceGrades = nine?.evidence_ladder?.map((item) => item.grade) || [];
  const evidenceGradeScore = evidenceGrades.length
    ? evidenceGrades.reduce((sum, grade) => sum + gradeWeight(grade), 0) / evidenceGrades.length
    : 45;
  const weakEvidenceCount = evidenceGrades.filter((grade) => grade === 'D' || grade === 'E').length;
  const strongEvidenceCount = evidenceGrades.filter((grade) => grade === 'A' || grade === 'B').length;

  const missingItems = nine?.missing_perspective_matrix || [];
  const missingPenalty = missingItems.reduce((sum, item) => {
    if (item.status === '缺席') return sum + 5;
    if (item.status === '弱呈现') return sum + 2;
    return sum;
  }, 0);

  const keyFindingPenalty = (result.key_findings || []).reduce((sum, item) => {
    const pendingPenalty = item.verification_status === '待验证' || item.verification_status === '暂无法确认' ? 4 : 0;
    return sum + riskPenalty(item.speculation_risk) + pendingPenalty;
  }, 0);

  const web = result.web_verification;
  const verifiedBonus = Math.min((web?.verified_sources?.length || 0) * 2.5, 8);
  const backgroundBonus = Math.min((web?.background_sources?.length || 0) * 1, 4);
  const unconfirmedPenalty = Math.min((web?.unconfirmed_items?.length || 0) * 3, 12);
  const supportingBonus = Math.min((result.narrative_supporting_evidence?.length || 0) * 1.5, 6);

  const adjustedScore = clamp(
    baseScore * 0.82 +
    evidenceGradeScore * 0.18 +
    strongEvidenceCount * 2.5 +
    verifiedBonus +
    backgroundBonus +
    supportingBonus -
    weakEvidenceCount * 3 -
    missingPenalty -
    keyFindingPenalty -
    unconfirmedPenalty
  );

  const fatalWeakness =
    (credibility < 42 && evidence < 45) ||
    (evidence < 35 && speculation > 70) ||
    (bias > 82 && speculation > 68 && completeness < 55) ||
    (evidenceGrades.length > 0 && weakEvidenceCount >= Math.max(3, evidenceGrades.length * 0.7) && strongEvidenceCount === 0);

  const strongGate =
    credibility >= 78 &&
    evidence >= 70 &&
    completeness >= 68 &&
    bias <= 55 &&
    speculation <= 45 &&
    strongEvidenceCount >= 1 &&
    weakEvidenceCount <= Math.max(1, evidenceGrades.length * 0.35);

  const label = verdictFromScore(adjustedScore, fatalWeakness, strongGate);

  return {
    label,
    score: adjustedScore,
    factors: {
      credibility,
      informationCompleteness: completeness,
      narrativeBias: bias,
      evidenceStrength: evidence,
      speculationRisk: speculation,
      evidenceGradeScore: clamp(evidenceGradeScore),
      weakEvidenceCount,
      strongEvidenceCount,
      missingPerspectivePenalty: missingPenalty,
      unconfirmedItemCount: web?.unconfirmed_items?.length || 0,
    },
  };
}

const PRODUCTIZED_LABELS = ['值得细读', '可以略读', '不值一读', '暂无法判断'];

function clamp(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.round(numeric), 0), 100);
}

function pickScores(input = {}) {
  const source = input.scores || {};
  const legacy = input.score_summary || {};
  return {
    credibility: clamp(source.credibility ?? legacy.credibility_score),
    informationCompleteness: clamp(source.informationCompleteness ?? legacy.information_completeness_score),
    narrativeBias: clamp(source.narrativeBias ?? legacy.narrative_bias_score),
    evidenceStrength: clamp(source.evidenceStrength ?? legacy.evidence_strength_score),
    speculationRisk: clamp(source.speculationRisk ?? legacy.speculation_risk_score),
  };
}

function computeReadWorthCore(input = {}) {
  const scores = pickScores(input);
  const balancedScore = clamp(
    scores.credibility * 0.3 +
    scores.evidenceStrength * 0.25 +
    scores.informationCompleteness * 0.2 +
    (100 - scores.narrativeBias) * 0.13 +
    (100 - scores.speculationRisk) * 0.12
  );

  let label = '可以略读';

  if (
    scores.credibility >= 76 &&
    scores.evidenceStrength >= 70 &&
    scores.informationCompleteness >= 65 &&
    scores.narrativeBias <= 55 &&
    scores.speculationRisk <= 45
  ) {
    label = '值得细读';
  } else if (
    scores.credibility < 35 ||
    scores.evidenceStrength < 30 ||
    (scores.narrativeBias >= 82 && scores.informationCompleteness < 45) ||
    (scores.speculationRisk >= 82 && scores.evidenceStrength < 45)
  ) {
    label = '不值一读';
  } else if (
    scores.informationCompleteness < 42 &&
    scores.evidenceStrength < 42 &&
    scores.speculationRisk >= 65 &&
    scores.credibility >= 40
  ) {
    label = '暂无法判断';
  }

  if (!PRODUCTIZED_LABELS.includes(label)) label = '暂无法判断';

  return {
    label,
    score: balancedScore,
    factors: {
      credibility: scores.credibility,
      informationCompleteness: scores.informationCompleteness,
      narrativeBias: scores.narrativeBias,
      evidenceStrength: scores.evidenceStrength,
      speculationRisk: scores.speculationRisk,
      evidenceGradeScore: scores.evidenceStrength,
      weakEvidenceCount: 0,
      strongEvidenceCount: 0,
      missingPerspectivePenalty: Math.max(0, 70 - scores.informationCompleteness),
      unconfirmedItemCount: scores.speculationRisk >= 70 ? 1 : 0,
    },
  };
}

export {
  PRODUCTIZED_LABELS,
  computeReadWorthCore,
};

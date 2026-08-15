const PRODUCTIZED_LABELS = ['深度阅读', '概览阅读', '有限参考', '材料不足'];

const LEGACY_LABELS = new Map([
  ['值得细读', '深度阅读'],
  ['可以略读', '概览阅读'],
  ['不值一读', '有限参考'],
  ['暂无法判断', '材料不足'],
  ['worth reading', '深度阅读'],
  ['read closely', '深度阅读'],
  ['skimmable', '概览阅读'],
  ['not worth reading', '有限参考'],
  ['insufficient information', '材料不足'],
]);

const LEGACY_UTILITY_SCORES = {
  深度阅读: 80,
  概览阅读: 58,
  有限参考: 35,
};

function clamp(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.round(numeric), 0), 100);
}

function normalizeReadWorthLabel(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (PRODUCTIZED_LABELS.includes(normalized)) return normalized;
  return LEGACY_LABELS.get(normalized.toLowerCase()) || LEGACY_LABELS.get(normalized) || null;
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

function readUtilityValue(source, camelName, snakeName) {
  const value = source?.[camelName] ?? source?.[snakeName];
  return Number.isFinite(Number(value)) ? clamp(value) : null;
}

function pickReadingUtility(input = {}) {
  const source = input.readingUtility || input.reading_utility || {};
  const values = {
    publicImportance: readUtilityValue(source, 'publicImportance', 'public_importance'),
    informationGain: readUtilityValue(source, 'informationGain', 'information_gain'),
    uniqueness: readUtilityValue(source, 'uniqueness', 'uniqueness'),
    explanatoryDepth: readUtilityValue(source, 'explanatoryDepth', 'explanatory_depth'),
    actionability: readUtilityValue(source, 'actionability', 'actionability'),
    informationDensity: readUtilityValue(source, 'informationDensity', 'information_density'),
  };
  const providedCount = Object.values(values).filter((value) => value !== null).length;

  if (providedCount >= 4) {
    return {
      provided: true,
      factors: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? 50])),
    };
  }

  const legacyLabel = normalizeReadWorthLabel(input.readingValue || input.reading_value || input.read_worth?.label);
  const legacyScore = legacyLabel ? LEGACY_UTILITY_SCORES[legacyLabel] : null;
  if (legacyScore != null) {
    return {
      provided: false,
      factors: {
        publicImportance: legacyScore,
        informationGain: legacyScore,
        uniqueness: legacyScore,
        explanatoryDepth: legacyScore,
        actionability: legacyScore,
        informationDensity: legacyScore,
      },
    };
  }

  return { provided: false, factors: null };
}

function evidencePosture(scores, hasSufficientMaterial) {
  if (!hasSufficientMaterial) return 'insufficient_material';
  if (
    scores.credibility >= 65 &&
    scores.evidenceStrength >= 70 &&
    scores.speculationRisk <= 45
  ) return 'fact_reference';
  if (
    scores.credibility < 40 ||
    scores.evidenceStrength < 40 ||
    scores.speculationRisk >= 70
  ) return 'lead_reference';
  return 'cautious_reading';
}

function computeReadWorthCore(input = {}) {
  const scores = pickScores(input);
  const utility = pickReadingUtility(input);
  const storedLabel = normalizeReadWorthLabel(input.readingValue || input.reading_value || input.read_worth?.label);
  const hasSufficientMaterial = input.hasSufficientMaterial !== false && (utility.factors !== null || storedLabel !== '材料不足');

  if (!hasSufficientMaterial || !utility.factors) {
    return {
      label: '材料不足',
      score: 0,
      evidencePosture: 'insufficient_material',
      factors: null,
    };
  }

  const factors = utility.factors;
  const utilityScore = clamp(
    factors.publicImportance * 0.25 +
    factors.informationGain * 0.2 +
    factors.uniqueness * 0.15 +
    factors.explanatoryDepth * 0.15 +
    factors.actionability * 0.15 +
    factors.informationDensity * 0.1
  );

  let label = '有限参考';
  if (utilityScore >= 72) label = '深度阅读';
  else if (utilityScore >= 48) label = '概览阅读';

  return {
    label,
    score: utilityScore,
    evidencePosture: evidencePosture(scores, true),
    factors,
  };
}

export {
  PRODUCTIZED_LABELS,
  computeReadWorthCore,
  normalizeReadWorthLabel,
};

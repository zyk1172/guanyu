const LEGACY_DEPTHS = {
  quick: 'low',
  standard: 'medium',
  deep: 'high',
  exhaustive: 'extreme',
};

const OUTPUT_TOKEN_BUDGETS = {
  none: 8_000,
  low: 11_000,
  medium: 14_000,
  high: 19_000,
  extreme: 24_000,
};

const DEFAULT_ANALYSIS_TIMEOUT_MS = 255_000;
const MIN_ANALYSIS_TIMEOUT_MS = 120_000;
const MAX_ANALYSIS_TIMEOUT_MS = 270_000;

export function normalizeThinkingDepthCore(value) {
  const normalized = LEGACY_DEPTHS[value] || value;
  return Object.hasOwn(OUTPUT_TOKEN_BUDGETS, normalized) ? normalized : 'medium';
}

export function getModelOutputTokenBudget(value) {
  return OUTPUT_TOKEN_BUDGETS[normalizeThinkingDepthCore(value)];
}

export function getAnalysisTimeoutMs(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_ANALYSIS_TIMEOUT_MS;
  return Math.min(MAX_ANALYSIS_TIMEOUT_MS, Math.max(MIN_ANALYSIS_TIMEOUT_MS, parsed));
}

export function getReasoningDepthInstruction(value, language = 'zh-CN') {
  const depth = normalizeThinkingDepthCore(value);
  const english = language === 'en-US';
  const instructions = english
    ? {
        none: 'Use direct, concise assessment. Keep the required report sections complete, but do not add unnecessary branches of analysis.',
        low: 'Perform a light consistency check of central claims, evidence labels, and missing information before writing the report.',
        medium: 'Perform a balanced multi-angle review of claims, evidence, framing, omissions, stakeholders, and verification paths.',
        high: 'Cross-check central claims against the supplied external evidence; strengthen scrutiny of causal links, stakeholder trade-offs, and competing explanations.',
        extreme: 'Apply the strictest multi-angle review: separately test claims, evidence limits, causal assumptions, missing perspectives, competing explanations, and concrete verification paths.',
      }
    : {
        none: '保持直接、简洁的审视；仍需完整覆盖必需报告模块，但不扩展无必要的分析分支。',
        low: '在输出前对核心主张、证据标签和主要信息缺口做轻量一致性核对。',
        medium: '对主张、证据、叙事框架、缺席信息、利益关系与验证路径做平衡的多角度审视。',
        high: '结合已提供的联网材料交叉核对核心主张；强化因果链、利益代价关系与替代解释的审查。',
        extreme: '执行最严格的多维审视：分别检验主张、证据边界、因果假设、缺席视角、竞争解释及可执行验证路径。',
      };

  const boundary = english
    ? 'Do not reveal hidden reasoning or chain-of-thought. Output only the structured conclusions, evidence labels, uncertainty, and verification methods required by the schema.'
    : '不得输出隐藏推理过程或 chain-of-thought；只输出 Schema 要求的结构化结论、证据标签、不确定性和验证方式。';

  return `${instructions[depth]} ${boundary}`;
}

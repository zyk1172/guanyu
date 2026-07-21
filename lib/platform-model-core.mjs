export const PLATFORM_MODEL_PROVIDERS = Object.freeze([
  'openai_compatible',
  'openai',
  'gemini',
  'anthropic',
]);

export const PLATFORM_MODEL_SEARCH_MODES = Object.freeze(['platform', 'native', 'none']);
export const PLATFORM_MODEL_OPERATIONS = Object.freeze(['analysis', 'completion', 'followup']);

export const PLATFORM_OPERATION_BASE_COST_CENTS = Object.freeze({
  analysis: 300,
  completion: 200,
  followup: 100,
});

export function parseMultiplierToBps(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('点数倍率必须是最多两位小数的正数。');
  const [whole, fraction = ''] = raw.split('.');
  const bps = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0') || '0', 10);
  if (!Number.isSafeInteger(bps) || bps < 10 || bps > 1000) {
    throw new Error('点数倍率必须在 0.10 到 10.00 之间。');
  }
  return bps;
}

export function formatMultiplierBps(multiplierBps) {
  const value = Number(multiplierBps);
  if (!Number.isSafeInteger(value) || value < 0) return '1';
  const whole = Math.floor(value / 100);
  const decimal = String(value % 100).padStart(2, '0').replace(/0+$/, '');
  return decimal ? `${whole}.${decimal}` : String(whole);
}

export function calculatePlatformOperationCostCents(baseCostCents, multiplierBps) {
  if (!Number.isSafeInteger(baseCostCents) || baseCostCents < 0) throw new Error('基础点数无效。');
  if (!Number.isSafeInteger(multiplierBps) || multiplierBps < 0) throw new Error('点数倍率无效。');
  if (baseCostCents === 0 || multiplierBps === 0) return 0;
  // baseCostCents * multiplierBps / 100, rounded upward to a 50-cent step.
  // All operands remain integers so there is no floating-point billing drift.
  return Math.ceil((baseCostCents * multiplierBps) / 5000) * 50;
}

export function operationCostCents(operation, multiplierBps) {
  const base = PLATFORM_OPERATION_BASE_COST_CENTS[operation];
  if (!Number.isSafeInteger(base)) throw new Error('不支持的模型操作。');
  return calculatePlatformOperationCostCents(base, multiplierBps);
}

export function formatCreditCents(cents) {
  const value = Number(cents);
  if (!Number.isSafeInteger(value)) return '0';
  const whole = Math.trunc(value / 100);
  const remainder = Math.abs(value % 100);
  if (remainder === 0) return String(whole);
  if (remainder === 50) return `${whole}.5`;
  return `${whole}.${String(remainder).padStart(2, '0').replace(/0+$/, '')}`;
}

function parsedLocaleMap(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function localizedModelText(fallback, translations, locale) {
  const map = parsedLocaleMap(translations);
  const normalized = String(locale || 'zh-CN');
  return String(map[normalized] || map[normalized.split('-')[0]] || map['zh-CN'] || fallback || '').trim();
}

export function operationCapabilityField(operation) {
  if (operation === 'analysis') return 'supportsAnalysis';
  if (operation === 'completion') return 'supportsCompletion';
  if (operation === 'followup') return 'supportsFollowup';
  throw new Error('不支持的模型操作。');
}

export function normalizeModelOperation(value) {
  return PLATFORM_MODEL_OPERATIONS.includes(value) ? value : 'analysis';
}

export function estimateExternalCostMicros(config, usage = {}) {
  const inputTokens = Math.max(0, Number.parseInt(String(usage.inputTokens || 0), 10) || 0);
  const outputTokens = Math.max(0, Number.parseInt(String(usage.outputTokens || 0), 10) || 0);
  const nativeSearchRequests = Math.max(0, Number.parseInt(String(usage.nativeSearchRequests || 0), 10) || 0);
  const inputRate = Math.max(0, Number.parseInt(String(config.inputPriceMicrosPerMillion || 0), 10) || 0);
  const outputRate = Math.max(0, Number.parseInt(String(config.outputPriceMicrosPerMillion || 0), 10) || 0);
  const searchRate = Math.max(0, Number.parseInt(String(config.nativeSearchPriceMicrosPerRequest || 0), 10) || 0);
  return Math.ceil((inputTokens * inputRate) / 1_000_000)
    + Math.ceil((outputTokens * outputRate) / 1_000_000)
    + nativeSearchRequests * searchRate;
}

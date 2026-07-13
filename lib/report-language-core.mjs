const FIXED_VALUE_KEYS = new Set([
  'methodology',
  'readingValue',
  'judgmentType',
  'speculationRisk',
  'reasonableness',
  'priority',
  'verificationStatus',
]);

const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const KANA_PATTERN = /[\u3040-\u30ff]/;
const HANGUL_PATTERN = /[\uac00-\ud7af]/;

const LANGUAGE_RULES = {
  'zh-CN': {
    name: 'Simplified Chinese',
    rule: 'All reader-facing JSON string values must be written in clear, neutral Simplified Chinese. Do not mix English or another language into reader-facing report prose unless it is a proper name, quotation, URL, or technical identifier.',
    error: '模型未能生成完整简体中文报告，请更换模型后重试。',
  },
  'zh-TW': {
    name: 'Traditional Chinese',
    rule: 'All reader-facing JSON string values must be written in clear, neutral Traditional Chinese. Use traditional characters consistently; do not mix Simplified Chinese prose into reader-facing report content.',
    error: '模型未能生成完整繁體中文報告，請更換模型後重試。',
  },
  'en-US': {
    name: 'English',
    rule: 'All reader-facing JSON string values must be English. Use clear, neutral English and do not copy Chinese prose from the input, prompt, or schema examples.',
    error: 'The model did not generate a complete English report. Please change the model and try again.',
  },
  'ja-JP': {
    name: 'Japanese',
    rule: 'All reader-facing JSON string values must be written in clear, neutral Japanese. Do not mix Chinese, English, Korean, German, or Italian prose into reader-facing report content except proper names, quotations, URLs, and technical identifiers.',
    error: 'モデルは完全な日本語レポートを生成できませんでした。モデルを変更して再試行してください。',
  },
  'ko-KR': {
    name: 'Korean',
    rule: 'All reader-facing JSON string values must be written in clear, neutral Korean. Do not mix Chinese, English, Japanese, German, or Italian prose into reader-facing report content except proper names, quotations, URLs, and technical identifiers.',
    error: '모델이 완전한 한국어 보고서를 생성하지 못했습니다. 모델을 변경한 뒤 다시 시도하세요.',
  },
  'de-DE': {
    name: 'German',
    rule: 'All reader-facing JSON string values must be written in clear, neutral German. Do not copy Chinese, Japanese, Korean, English, or Italian prose from the input, prompt, or schema examples.',
    error: 'Das Modell hat keinen vollstaendigen Bericht auf Deutsch erzeugt. Bitte das Modell wechseln und erneut versuchen.',
  },
  'it-IT': {
    name: 'Italian',
    rule: 'All reader-facing JSON string values must be written in clear, neutral Italian. Do not copy Chinese, Japanese, Korean, English, or German prose from the input, prompt, or schema examples.',
    error: 'Il modello non ha generato un rapporto completo in italiano. Cambia modello e riprova.',
  },
};

export function getReportLanguageRule(language) {
  return LANGUAGE_RULES[language] || LANGUAGE_RULES['zh-CN'];
}

export function buildReportLanguageSystemGuard(language) {
  const rule = getReportLanguageRule(language);
  return `CRITICAL OUTPUT LANGUAGE RULE: ${rule.rule} Preserve only JSON keys, numbers, URLs, A/B/C/D/E grades, verification-status codes, and fixed enum fields required by the parser. Do not add Markdown or explanation outside the JSON object.`;
}

function containsUnexpectedScript(value, language) {
  if (language === 'en-US' || language === 'de-DE' || language === 'it-IT') {
    return CJK_PATTERN.test(value) || KANA_PATTERN.test(value) || HANGUL_PATTERN.test(value);
  }
  if (language === 'ko-KR') return KANA_PATTERN.test(value);
  return false;
}

export function hasUnexpectedReportProse(value, language = 'zh-CN', key = '') {
  if (typeof value === 'string') {
    return !FIXED_VALUE_KEYS.has(key) && containsUnexpectedScript(value, language);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasUnexpectedReportProse(item, language, key));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([childKey, childValue]) => hasUnexpectedReportProse(childValue, language, childKey));
  }
  return false;
}

export function hasUnexpectedChineseReportProse(value, key = '') {
  return hasUnexpectedReportProse(value, 'en-US', key);
}

export function buildReportLanguageJsonRepairPrompt(reportJson, language = 'en-US') {
  const rule = getReportLanguageRule(language);
  return `Translate every reader-facing JSON string value in the following report into clear, neutral ${rule.name}. Preserve the exact JSON structure, keys, numeric values, URLs, A/B/C/D/E grades, verification-status codes, and fixed enum values. Do not add commentary or Markdown. Return only the corrected JSON object.\n\n${JSON.stringify(reportJson)}`;
}

export function buildEnglishJsonRepairPrompt(reportJson) {
  return buildReportLanguageJsonRepairPrompt(reportJson, 'en-US');
}

export function getLanguageRepairErrorMessage(language) {
  return getReportLanguageRule(language).error;
}

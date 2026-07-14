import { getReportLanguageRule } from './report-language-core.mjs';

const READING_VALUES = new Set(['值得细读', '可以略读', '不值一读', '暂无法判断']);

const READING_VALUE_ALIASES = new Map([
  ['值得细读', '值得细读'], ['值得閱讀', '值得细读'], ['值得一读', '值得细读'],
  ['可以略读', '可以略读'], ['可以略讀', '可以略读'], ['略读', '可以略读'], ['略讀', '可以略读'],
  ['不值一读', '不值一读'], ['不值一讀', '不值一读'], ['不值得读', '不值一读'], ['不值得讀', '不值一读'],
  ['暂无法判断', '暂无法判断'], ['暫無法判斷', '暂无法判断'], ['无法判断', '暂无法判断'], ['無法判斷', '暂无法判断'],
  ['worth reading', '值得细读'], ['read closely', '值得细读'], ['skimmable', '可以略读'], ['can skim', '可以略读'],
  ['not worth reading', '不值一读'], ['not worth it', '不值一读'], ['insufficient information', '暂无法判断'],
]);

function getCardLimits(reportLanguage) {
  const cjk = String(reportLanguage || '').startsWith('zh-') || ['ja-JP', 'ko-KR'].includes(reportLanguage);
  return cjk ? { view: 90, signal: 100 } : { view: 165, signal: 170 };
}

function clip(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trim()}…` : text;
}

function asArray(value, limit = 3) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function compactReport(report = {}) {
  const source = report.sourceInterpretation || report.source_interpretation || {};
  const quickSignals = report.quickSignals || report.quick_signals || {};
  const findings = asArray(report.keyFindings || report.key_findings).map((item) => ({
    title: clip(item?.title, 120),
    content: clip(item?.content || item?.detail, 260),
  }));
  const evidence = asArray(report.supportingEvidence || report.narrative_supporting_evidence).map((item) => clip(item?.content || item?.detail, 260));
  const gaps = asArray(report.informationGaps || report.major_information_gaps).map((item) => clip(item?.description || item?.detail || item?.title, 260));

  return {
    oneSentenceView: clip(report.oneSentenceConclusion || report.one_sentence_conclusion || report.oneSentenceJudgment, 360),
    readingValue: report.readingValue || report.reading_value || report.read_worth?.label,
    sourceInterpretation: {
      whatItSays: clip(source.whatItSays || source.what_it_says || report.newsSummary || report.news_summary, 420),
      keyEvidence: asArray(source.keyEvidence || source.key_evidence).map((item) => clip(item, 220)),
    },
    quickSignals: {
      mostCredibleInfo: clip(quickSignals.mostCredibleInfo || quickSignals.most_credible_info, 260),
      biggestGap: clip(quickSignals.biggestGap || quickSignals.biggest_gap, 260),
      narrativeToWatch: clip(quickSignals.narrativeToWatch || quickSignals.narrative_to_watch, 260),
    },
    keyFindings: findings,
    supportingEvidence: evidence,
    informationGaps: gaps,
    questionsToAsk: asArray(report.questionsToAsk || report.questions_to_ask_next).map((item) => clip(item, 260)),
  };
}

function firstText(...values) {
  return values
    .flat(Infinity)
    .map((value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
    .find(Boolean) || '';
}

function normalizeReadingValue(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (READING_VALUES.has(normalized)) return normalized;
  return READING_VALUE_ALIASES.get(normalized.toLowerCase()) || '暂无法判断';
}

function fallbackCopy(reportLanguage) {
  const copy = {
    'zh-CN': {
      view: '报告缺少可直接摘取的一句话判断，建议结合原文与完整报告核对。',
      credible: '当前报告未提供可直接摘取的强证据摘要，请查看完整报告中的证据与核验状态。',
      gap: '当前报告未提供可直接摘取的核心信息缺口，需回到原文与核验材料判断。',
      question: '原文中最关键的事实主张，是否有可复核的原始材料或独立来源支持？',
    },
    'zh-TW': {
      view: '報告缺少可直接摘取的一句判斷，建議結合原文與完整報告核對。',
      credible: '目前報告未提供可直接摘取的強證據摘要，請查看完整報告中的證據與核驗狀態。',
      gap: '目前報告未提供可直接摘取的核心資訊缺口，需回到原文與核驗材料判斷。',
      question: '原文中最關鍵的事實主張，是否有可複核的原始材料或獨立來源支持？',
    },
    'en-US': {
      view: 'No concise finding could be extracted automatically; compare the article with the full review.',
      credible: 'No strong-evidence summary could be extracted automatically; consult the report evidence and verification state.',
      gap: 'No core information gap could be extracted automatically; check the article and verification material.',
      question: 'Which key factual claim in the article is supported by a reviewable primary record or independent source?',
    },
    'ja-JP': {
      view: '要点を自動抽出できませんでした。原文と完全なレポートを照合してください。',
      credible: '強い証拠の要約を自動抽出できませんでした。完全なレポートの証拠と検証状況を確認してください。',
      gap: '主要な情報欠落を自動抽出できませんでした。原文と検証資料を確認してください。',
      question: '記事の主要な事実主張は、検証可能な一次資料または独立した情報源で裏付けられていますか？',
    },
    'ko-KR': {
      view: '핵심 판단을 자동으로 추출하지 못했습니다. 원문과 전체 보고서를 함께 확인하세요.',
      credible: '강한 증거 요약을 자동으로 추출하지 못했습니다. 전체 보고서의 증거와 검증 상태를 확인하세요.',
      gap: '핵심 정보 공백을 자동으로 추출하지 못했습니다. 원문과 검증 자료를 확인하세요.',
      question: '기사의 핵심 사실 주장은 검토 가능한 1차 자료나 독립 출처로 뒷받침됩니까?',
    },
    'de-DE': {
      view: 'Es konnte keine kurze Kernaussage extrahiert werden. Vergleichen Sie Artikel und vollstaendigen Bericht.',
      credible: 'Es konnte keine Zusammenfassung starker Belege extrahiert werden. Pruefen Sie Belege und Verifikationsstatus im Bericht.',
      gap: 'Es konnte keine zentrale Informationsluecke extrahiert werden. Pruefen Sie Artikel und Verifikationsmaterial.',
      question: 'Welche zentrale Tatsachenbehauptung des Artikels wird durch eine pruefbare Primaerquelle oder unabhaengige Quelle gestuetzt?',
    },
    'it-IT': {
      view: 'Non e stato possibile estrarre una conclusione sintetica. Confronta l articolo con il rapporto completo.',
      credible: 'Non e stato possibile estrarre una sintesi delle prove piu solide. Consulta prove e stato di verifica nel rapporto.',
      gap: 'Non e stato possibile estrarre una lacuna informativa centrale. Controlla articolo e materiali di verifica.',
      question: 'Quale affermazione fattuale chiave dell articolo e sostenuta da una fonte primaria verificabile o indipendente?',
    },
  };
  return copy[reportLanguage] || copy['zh-CN'];
}

/**
 * Build a card directly from persisted report fields. This is deliberately
 * independent of the model request so a report remains shareable when a model
 * emits prose around JSON, times out, or its configuration is unavailable.
 * @param {{ report?: Record<string, unknown>, reportLanguage?: string }} input
 */
export function buildGuanyuCardFallback({ report, reportLanguage = 'zh-CN' } = {}) {
  const compact = compactReport(report);
  const copy = fallbackCopy(reportLanguage);
  const firstFinding = compact.keyFindings[0] || {};

  return {
    oneSentenceView: firstText(compact.oneSentenceView, firstFinding.content, firstFinding.title, compact.sourceInterpretation.whatItSays, copy.view),
    mostCredible: firstText(compact.quickSignals.mostCredibleInfo, compact.sourceInterpretation.keyEvidence, compact.supportingEvidence, copy.credible),
    largestInformationGap: firstText(compact.quickSignals.biggestGap, compact.informationGaps, copy.gap),
    mostWorthAsking: firstText(compact.questionsToAsk, compact.quickSignals.narrativeToWatch, copy.question),
    readingValue: normalizeReadingValue(compact.readingValue),
  };
}

/**
 * @param {{ title?: string, source?: string, report?: Record<string, unknown>, reportLanguage?: string }} input
 */
export function buildGuanyuCardPrompt({ title, source, report, reportLanguage = 'zh-CN' } = {}) {
  const language = getReportLanguageRule(reportLanguage);
  const english = reportLanguage === 'en-US';
  const limits = getCardLimits(reportLanguage);
  const schema = `{
  "oneSentenceView": "string",
  "mostCredible": "string",
  "largestInformationGap": "string",
  "mostWorthAsking": "string",
  "readingValue": "值得细读 | 可以略读 | 不值一读 | 暂无法判断"
}`;

  return {
    system: `You create a Guanyu Card: a fixed-format social sharing card for a news narrative review. It is not a report summary and must be calm, evidence-led, and non-sensational. ${language.rule}\n\nReturn JSON only, with exactly these five keys and no Markdown:\n${schema}\n\nConstraints:\n- oneSentenceView: one concise sentence identifying the most important gap, narrative issue, or reading reminder. Maximum ${limits.view} characters, including spaces.\n- mostCredible: one or two concise sentences on the strongest currently supported information. Maximum ${limits.signal} characters, including spaces.\n- largestInformationGap: one or two concise sentences on the missing information that most affects judgment. Maximum ${limits.signal} characters, including spaces.\n- mostWorthAsking: one or two concise sentences containing the single most useful next question. Maximum ${limits.signal} characters, including spaces.\n- Never insert line breaks inside a field. Write complete words and complete sentences only; do not use ellipses to cut content.\n- readingValue must be one of the fixed Chinese enum values above; it is rendered and localized by the app.\n- Do not invent facts, sources, motives, figures, or conclusions. Do not use headings, scores, methodology, calls to action, or extra fields.`,
    user: `${english ? 'News title' : '新闻标题'}: ${clip(title, 300)}\n${english ? 'Source' : '来源'}: ${clip(source, 240)}\n\n${english ? 'Structured report excerpts' : '结构化报告摘录'}:\n${JSON.stringify(compactReport(report), null, 2)}\n\n${english ? 'Generate the five Guanyu Card fields now.' : '请现在生成五个观隅卡字段。'}`,
  };
}

export function parseGuanyuCardContent(value, reportLanguage = 'zh-CN') {
  // Preserve the locale argument for compatible callers; parsing itself is locale-agnostic.
  void reportLanguage;
  const raw = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('观隅卡返回的不是有效 JSON。');
    try {
      parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      throw new Error('观隅卡返回的不是有效 JSON。');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('观隅卡返回字段不符合固定模板。');
  }

  const content = parsed.card && typeof parsed.card === 'object' && !Array.isArray(parsed.card) ? parsed.card : parsed;

  const readField = (field) => {
    return String(content[field] || '').replace(/\s+/g, ' ').trim();
  };
  const card = {
    oneSentenceView: readField('oneSentenceView'),
    mostCredible: readField('mostCredible'),
    largestInformationGap: readField('largestInformationGap'),
    mostWorthAsking: readField('mostWorthAsking'),
    readingValue: normalizeReadingValue(content.readingValue),
  };
  if (Object.values(card).some((item) => !item)) throw new Error('观隅卡缺少必要内容。');
  return card;
}

export { READING_VALUES };

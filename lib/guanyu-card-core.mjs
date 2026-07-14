import { hasUnexpectedReportProse, getReportLanguageRule } from './report-language-core.mjs';

const READING_VALUES = new Set(['值得细读', '可以略读', '不值一读', '暂无法判断']);

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
  const raw = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('观隅卡返回的不是有效 JSON。');
  }

  const allowed = ['oneSentenceView', 'mostCredible', 'largestInformationGap', 'mostWorthAsking', 'readingValue'];
  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).some((key) => !allowed.includes(key))) {
    throw new Error('观隅卡返回字段不符合固定模板。');
  }

  const limits = getCardLimits(reportLanguage);
  const readField = (field, limit) => {
    const text = String(parsed[field] || '').replace(/\s+/g, ' ').trim();
    if (text.length > limit) throw new Error('观隅卡内容过长，无法在固定版式中完整展示。');
    return text;
  };
  const card = {
    oneSentenceView: readField('oneSentenceView', limits.view),
    mostCredible: readField('mostCredible', limits.signal),
    largestInformationGap: readField('largestInformationGap', limits.signal),
    mostWorthAsking: readField('mostWorthAsking', limits.signal),
    readingValue: String(parsed.readingValue || '').trim(),
  };
  if (Object.values(card).some((item) => !item)) throw new Error('观隅卡缺少必要内容。');
  if (!READING_VALUES.has(card.readingValue)) throw new Error('观隅卡的阅读价值标签无效。');
  if (hasUnexpectedReportProse(card, reportLanguage)) throw new Error(getReportLanguageRule(reportLanguage).error);
  return card;
}

export { READING_VALUES };

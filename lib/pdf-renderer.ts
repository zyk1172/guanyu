import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { parseExportReport } from '@/lib/report-export-content';

type AuditForPdf = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  newsSummary: string;
  auditResultJson: string;
  originalContent: string;
  modelName: string;
  reasoningDepth: string;
  reportLanguage: string;
  createdAt: Date;
  reportVersion: number;
  completionMarkdown?: string | null;
};

type ReportItem = Record<string, unknown>;

const PAGE = { width: 595.28, height: 841.89, left: 60, right: 60, top: 70, bottom: 58 };
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.ttf');
const MAX_APPENDIX_CHARS = 32_000;
const MAX_SECTION_ITEMS = 24;
const MAX_ITEM_CHARS = 2_500;

const INK = '#111111';
const MUTED = '#242424';
const RULE = '#777777';

function isChinese(language: string) {
  return language.toLowerCase().startsWith('zh');
}

function needsCjkFont(language: string) {
  return /^(zh|ja|ko)(-|$)/i.test(language);
}

function copy(language: string, zh: string, en: string) {
  return isChinese(language) ? zh : en;
}

function plain(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\u0000/g, '').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const item = value as ReportItem;
    return plain(
      item.content ?? item.detail ?? item.description ?? item.reason ?? item.text ?? item.title ?? item.question
      ?? item.role ?? item.actor ?? item.explanation ?? item.perspective ?? item.target ?? item.claim
      ?? item.supportsNarrative ?? item.supports_narrative ?? item.whatItSays ?? item.what_it_says
    );
  }
  return '';
}

function truncate(value: string, maxChars: number) {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function items(value: unknown): ReportItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === 'object' && item !== null ? item as ReportItem : { content: item })
    .filter((item) => Boolean(plain(item)))
    .slice(0, MAX_SECTION_ITEMS);
}

function itemTitle(item: ReportItem) {
  return truncate(plain(item.title ?? item.supportsNarrative ?? item.supports_narrative ?? item.role ?? item.actor ?? item.question ?? item.target ?? item.explanation ?? item.perspective ?? item.content ?? item.description) || '-', 360);
}

function itemBody(item: ReportItem) {
  return truncate(plain(item.content ?? item.detail ?? item.description ?? item.reason ?? item.snippet ?? item.whyItMatters ?? item.why_it_matters), MAX_ITEM_CHARS);
}

function localizedValue(value: unknown, language: string) {
  const raw = plain(value);
  const zh = isChinese(language);
  const localized: Record<string, [string, string]> = {
    source_supported: ['原文支持', 'Supported by the article'],
    externally_verified: ['外部已核验', 'Externally verified'],
    partially_supported: ['部分支持', 'Partially supported'],
    pending_verification: ['待核验', 'Pending verification'],
    unable_to_verify: ['暂无法确认', 'Unable to verify'],
    '原文支持': ['原文支持', 'Supported by the article'],
    '外部已核验': ['外部已核验', 'Externally verified'],
    '部分支持': ['部分支持', 'Partially supported'],
    '待核验': ['待核验', 'Pending verification'],
    '暂无法确认': ['暂无法确认', 'Unable to verify'],
    high: ['高', 'High'], medium: ['中', 'Medium'], low: ['低', 'Low'],
    '高': ['高', 'High'], '中': ['中', 'Medium'], '低': ['低', 'Low'],
  };
  return localized[raw]?.[zh ? 0 : 1] ?? raw;
}

function fieldLabel(language: string, key: string) {
  const zh = isChinese(language);
  const labels: Record<string, [string, string]> = {
    judgmentType: ['判断类型', 'Judgment type'], evidenceGrade: ['证据等级', 'Evidence grade'], verificationStatus: ['核验状态', 'Verification status'], speculationRisk: ['推测不确定性', 'Speculation uncertainty'], whyItMatters: ['重要性', 'Why it matters'], nextVerification: ['下一步核验', 'Next verification'], limitation: ['局限', 'Limitation'], supportsNarrative: ['支持的原文叙事', 'Narrative supported'], possibleBenefit: ['可能利益', 'Potential benefit'], possibleCost: ['可能代价', 'Potential cost'], currentEvidenceStatus: ['当前证据', 'Current evidence'], neededVerification: ['需要核验', 'Required verification'], materialType: ['材料类型', 'Material type'], priority: ['优先级', 'Priority'], source: ['来源', 'Source'], url: ['链接', 'URL'],
  };
  return labels[key]?.[zh ? 0 : 1] ?? key;
}

function scoreValue(scores: ReportItem, ...keys: string[]) {
  for (const key of keys) {
    const value = scores[key];
    if (typeof value === 'number' || typeof value === 'string') return String(value);
  }
  return '-';
}

function parseReport(audit: AuditForPdf): ReportItem {
  return parseExportReport(audit.auditResultJson);
}

function reportAppendix(content: string, language: string) {
  const clean = plain(content);
  if (clean.length <= MAX_APPENDIX_CHARS) return clean;
  const notice = copy(language, `\n\n[为确保正式文件可稳定生成，附录仅保留原文前 ${MAX_APPENDIX_CHARS.toLocaleString('zh-CN')} 字；完整原文仍可在观隅报告页面查阅。]`, `\n\n[To keep this formal export reliable, the appendix includes the first ${MAX_APPENDIX_CHARS.toLocaleString('en-US')} characters. The complete source remains available on the Guanyu report page.]`);
  return `${clean.slice(0, MAX_APPENDIX_CHARS)}${notice}`;
}

class AcademicPdf {
  private readonly contents: Array<{ title: string; page: number }> = [];
  private readonly sourceNumbers = new Map<string, number>();
  private readonly fontName = 'GuanyuBody';
  private readonly auxiliaryFontName = 'GuanyuAuxiliary';
  private contentHeadersEnabled = false;

  constructor(private readonly doc: any, private readonly audit: AuditForPdf, private readonly language: string) {
    this.doc.on('pageAdded', () => {
      if (!this.contentHeadersEnabled) return;
      this.drawContentHeader();
      this.doc.y = PAGE.top;
    });
  }

  private get width() {
    return PAGE.width - PAGE.left - PAGE.right;
  }

  private pageIndex() {
    const range = this.doc.bufferedPageRange();
    return range.start + range.count - 1;
  }

  private useFont(size: number, color = INK) {
    return this.doc.font(this.fontName).fontSize(size).fillColor(color);
  }

  private addPage(content = false) {
    this.contentHeadersEnabled = content;
    this.doc.addPage({ size: 'A4', margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right } });
  }

  private drawContentHeader() {
    this.doc.font(this.auxiliaryFontName).fontSize(7.3).fillColor(MUTED).text('GUANYU / NEWS NARRATIVE REVIEW REPORT', PAGE.left, 30, { width: this.width });
    this.doc.moveTo(PAGE.left, 44).lineTo(PAGE.width - PAGE.right, 44).lineWidth(0.4).strokeColor(RULE).stroke();
  }

  private ensureSpace(height: number) {
    if (this.doc.y + height > PAGE.height - PAGE.bottom) this.addPage(true);
  }

  private rule(thickness = 0.45) {
    this.doc.moveTo(PAGE.left, this.doc.y).lineTo(PAGE.width - PAGE.right, this.doc.y).lineWidth(thickness).strokeColor(RULE).stroke();
    this.doc.moveDown(0.7);
  }

  private paragraph(value: unknown, options: { size?: number; color?: string; gap?: number; indent?: number } = {}) {
    const content = truncate(plain(value), MAX_ITEM_CHARS * 5);
    if (!content) return;
    const size = options.size ?? 9.8;
    this.useFont(size, options.color ?? INK).text(content, {
      width: this.width - (options.indent ?? 0),
      indent: options.indent ?? 0,
      lineGap: size * 0.28,
      paragraphGap: 0,
    });
    this.doc.moveDown(options.gap ?? 0.55);
  }

  private heading(title: string) {
    this.ensureSpace(78);
    this.contents.push({ title, page: this.pageIndex() + 1 });
    this.useFont(14.5).text(title, { width: this.width, lineGap: 2 });
    this.doc.moveDown(0.35);
    this.rule(0.7);
  }

  private subheading(value: string) {
    this.ensureSpace(34);
    this.useFont(10.4).text(value, { width: this.width, lineGap: 2 });
    this.doc.moveDown(0.2);
  }

  private labeledParagraph(label: string, value: unknown, size = 9.5) {
    const content = plain(value);
    if (!content) return;
    this.paragraph(`${label}${isChinese(this.language) ? '：' : ': '}${content}`, { size, color: MUTED, gap: 0.45 });
  }

  private labeledList(label: string, value: unknown) {
    const entries = Array.isArray(value) ? value.map(plain).filter(Boolean) : [];
    if (!entries.length) return;
    this.subheading(label);
    entries.forEach((entry, index) => this.paragraph(`${index + 1}. ${entry}`, { size: 9.5, gap: 0.25 }));
    this.doc.moveDown(0.15);
  }

  private itemDetails(item: ReportItem) {
    const fields: Array<[string, unknown]> = [
      ['judgmentType', item.judgmentType ?? item.judgment_type], ['evidenceGrade', item.evidenceGrade ?? item.evidence_grade], ['verificationStatus', item.verificationStatus ?? item.verification_status], ['speculationRisk', item.speculationRisk ?? item.speculation_risk], ['supportsNarrative', item.supportsNarrative ?? item.supports_narrative], ['whyItMatters', item.whyItMatters ?? item.why_it_matters], ['limitation', item.limitation], ['possibleBenefit', item.possibleBenefit ?? item.possible_benefit], ['possibleCost', item.possibleCost ?? item.possible_cost], ['currentEvidenceStatus', item.currentEvidenceStatus ?? item.current_evidence], ['neededVerification', item.neededVerification ?? item.needed_verification], ['materialType', item.materialType ?? item.material_type], ['priority', item.priority], ['nextVerification', item.nextVerification ?? item.next_verification ?? item.verificationPath ?? item.verification_path], ['source', item.source ?? item.provider],
    ];
    return fields.map(([key, value]) => [fieldLabel(this.language, key), localizedValue(value, this.language)] as const).filter(([, value]) => Boolean(value));
  }

  private item(item: ReportItem, index: number) {
    this.ensureSpace(112);
    this.useFont(10.2).text(`${index}. ${itemTitle(item)}`, { width: this.width, lineGap: 2 });
    const body = itemBody(item);
    if (body && body !== itemTitle(item)) this.paragraph(body, { size: 9.5, color: MUTED, gap: 0.3 });
    this.itemDetails(item).forEach(([label, value]) => this.labeledParagraph(label, value, 8.8));
    const source = this.sourceReference(item);
    if (source) this.labeledParagraph(copy(this.language, '参考来源', 'Reference'), source, 8.6);
    this.rule(0.3);
  }

  private items(value: unknown) {
    items(value).forEach((item, index) => this.item(item, index + 1));
  }

  private sourceReference(item: ReportItem) {
    const raw = plain(item.sourceReference ?? item.source_reference ?? item.sourceUrl ?? item.source_url ?? item.url);
    const index = raw ? this.sourceNumbers.get(raw) : undefined;
    return index ? `[S${index}]` : '';
  }

  private cover(report: ReportItem) {
    this.addPage();
    this.useFont(10).text(needsCjkFont(this.language) ? 'GUANYU / 观隅' : 'GUANYU', PAGE.left, 56, { width: this.width });
    this.doc.moveTo(PAGE.left, 82).lineTo(PAGE.width - PAGE.right, 82).lineWidth(0.7).strokeColor(RULE).stroke();
    this.useFont(24).text(copy(this.language, '新闻叙事审视报告', 'News Narrative Review Report'), PAGE.left, 170, { width: this.width, lineGap: 6 });
    this.useFont(15).text(this.audit.title, PAGE.left, 258, { width: this.width, lineGap: 5 });
    const conclusion = plain(report.oneSentenceConclusion ?? report.one_sentence_conclusion);
    if (conclusion) {
      this.useFont(9, MUTED).text(copy(this.language, '核心结论', 'Core conclusion'), PAGE.left, 370, { width: this.width });
      this.doc.moveTo(PAGE.left, 387).lineTo(PAGE.width - PAGE.right, 387).lineWidth(0.45).strokeColor(RULE).stroke();
      this.useFont(10.3).text(conclusion, PAGE.left, 404, { width: this.width, lineGap: 4 });
    }
    const metadata: Array<[string, string]> = [
      [copy(this.language, '来源', 'Source'), this.audit.source || '-'], [copy(this.language, '报告编号', 'Report ID'), this.audit.id], [copy(this.language, '生成模型', 'Model'), this.audit.modelName || '-'], [copy(this.language, '报告版本', 'Version'), `v${this.audit.reportVersion} | ${this.audit.reportLanguage}`], [copy(this.language, '新闻发布时间', 'Published'), this.audit.publishedAt || '-'], [copy(this.language, '生成时间', 'Generated'), this.audit.createdAt.toISOString().slice(0, 10)],
    ];
    metadata.forEach(([label, value], index) => {
      const x = PAGE.left + (index % 2) * 245;
      const y = 552 + Math.floor(index / 2) * 52;
      this.useFont(8, MUTED).text(label, x, y, { width: 220 });
      this.useFont(9).text(truncate(value, 76), x, y + 16, { width: 220, lineGap: 2 });
    });
    const disclaimer = copy(this.language, '本报告基于公开信息及系统分析生成，旨在辅助事实核验、叙事审视和风险研判，不构成法律、投资或其他专业意见。', 'This report is generated from public information and analytical processing. It supports factual review and risk analysis, and is not legal, investment, or other professional advice.');
    this.useFont(8, MUTED).text(disclaimer, PAGE.left, 750, { width: this.width, lineGap: 3 });
  }

  private writeContents(entries: Array<{ title: string; page: number }>) {
    this.useFont(18).text(copy(this.language, '目录', 'Contents'), PAGE.left, PAGE.top, { width: this.width });
    this.doc.moveTo(PAGE.left, PAGE.top + 32).lineTo(PAGE.width - PAGE.right, PAGE.top + 32).lineWidth(0.7).strokeColor(RULE).stroke();
    let y = PAGE.top + 58;
    entries.forEach((entry) => {
      if (y > PAGE.height - PAGE.bottom - 22) return;
      this.useFont(9.3).text(entry.title, PAGE.left, y, { width: this.width - 48, lineGap: 2 });
      this.useFont(9.3).text(String(entry.page), PAGE.width - PAGE.right - 18, y, { width: 18, align: 'right' });
      y += 22;
    });
  }

  private sourceInterpretation(report: ReportItem) {
    const source = (report.sourceInterpretation ?? report.source_interpretation ?? {}) as ReportItem;
    const mirror = (report.nine_mirror_review ?? {}) as ReportItem;
    const frame = (mirror.narrative_frame_analysis ?? {}) as ReportItem;
    this.labeledParagraph(copy(this.language, '原文在讲什么', 'What the article says'), source.whatItSays ?? source.what_it_says ?? report.originalReading ?? report.newsSummary ?? report.news_summary, 10);
    this.labeledList(copy(this.language, '核心主张', 'Core claims'), source.coreClaims ?? source.core_claims ?? items(mirror.atomic_claims).map((item) => item.claim));
    this.labeledList(copy(this.language, '主要主体', 'Main actors'), source.mainActors ?? source.main_actors);
    this.labeledList(copy(this.language, '原文关键证据', 'Key evidence in the article'), source.keyEvidence ?? source.key_evidence);
    this.labeledParagraph(copy(this.language, '叙事方式', 'Narrative style'), source.narrativeStyle ?? source.narrative_style ?? frame.problem_definition);
    this.labeledParagraph(copy(this.language, '读者最可能带走的印象', 'Likely reader takeaway'), source.likelyReaderImpression ?? source.likely_reader_impression ?? frame.implied_solution);
  }

  private readingAssessment(report: ReportItem) {
    this.labeledParagraph(copy(this.language, '阅读价值判断', 'Reading value'), localizedValue(report.readingValue ?? report.reading_value, this.language), 10.1);
    this.labeledParagraph(copy(this.language, '判断理由', 'Assessment rationale'), report.readingValueReason ?? report.reading_value_reason);
    this.labeledParagraph(copy(this.language, '给普通读者的读法', 'How a general reader can approach it'), report.normalReaderGuide ?? report.normal_reader_guide);
    this.labeledParagraph(copy(this.language, '一句话观隅审视', 'One-sentence Guanyu view'), report.oneSentenceConclusion ?? report.one_sentence_conclusion);
  }

  private metrics(report: ReportItem) {
    const scores = (report.scores ?? report.score_summary ?? {}) as ReportItem;
    const metrics: Array<[string, string, string]> = [
      [copy(this.language, '可信度', 'Credibility'), scoreValue(scores, 'credibility', 'credibility_score'), 'credibility'], [copy(this.language, '信息完整度', 'Information completeness'), scoreValue(scores, 'informationCompleteness', 'information_completeness_score'), 'informationCompleteness'], [copy(this.language, '叙事倾向性', 'Narrative tendency'), scoreValue(scores, 'narrativeBias', 'narrative_bias_score'), 'narrativeBias'], [copy(this.language, '证据强度', 'Evidence strength'), scoreValue(scores, 'evidenceStrength', 'evidence_strength_score'), 'evidenceStrength'], [copy(this.language, '推测不确定性', 'Speculation uncertainty'), scoreValue(scores, 'speculationRisk', 'speculation_risk_score'), 'speculationRisk'],
    ].filter(([, value]) => value !== '-') as Array<[string, string, string]>;
    metrics.forEach(([label, value, key]) => {
      this.ensureSpace(62);
      const reason = plain((report.scoreReasons as ReportItem | undefined)?.[key] ?? (report.score_reasons as ReportItem | undefined)?.[key]) || copy(this.language, '评分理由未单独提供。', 'No separate score rationale was provided.');
      const y = this.doc.y;
      this.useFont(9.2).text(label, PAGE.left, y, { width: 120 });
      this.useFont(9.2).text(`${value}/100`, PAGE.left + 128, y, { width: 40 });
      this.useFont(8.7, MUTED).text(reason, PAGE.left + 172, y, { width: this.width - 172, lineGap: 3 });
      this.doc.y = Math.max(this.doc.y, y + 32);
      this.rule(0.3);
    });
    this.paragraph(copy(this.language, '分数衡量报道结构与证据状态，不等同于新闻真假。', 'Scores measure reporting structure and evidence state; they are not a verdict on whether a story is true.'), { size: 8.5, color: MUTED });
  }

  private conclusionLayers(report: ReportItem) {
    const layers = (report.conclusionLayers ?? report.conclusion_layers ?? {}) as ReportItem;
    this.labeledList(copy(this.language, '可以确认', 'Can be confirmed'), layers.confirmed);
    this.labeledList(copy(this.language, '可以合理怀疑', 'Reasonable doubts'), layers.reasonableDoubts ?? layers.reasonable_doubts);
    this.labeledList(copy(this.language, '暂不能判断', 'Cannot yet be determined'), layers.cannotJudgeYet ?? layers.cannot_judge_yet);
  }

  private evidenceSummary(report: ReportItem) {
    const summary = (report.evidenceVerificationSummary ?? report.evidence_verification_summary ?? {}) as ReportItem;
    this.labeledParagraph(copy(this.language, '最强证据', 'Strongest evidence'), summary.strongestEvidence ?? summary.strongest_evidence);
    this.labeledParagraph(copy(this.language, '最弱证据', 'Weakest evidence'), summary.weakestEvidence ?? summary.weakest_evidence);
    this.labeledList(copy(this.language, '仅由原文支持', 'Supported by the article only'), summary.sourceSupportedClaims ?? summary.source_supported_claims);
    this.labeledList(copy(this.language, '外部已核验', 'Externally verified'), summary.externallyVerifiedClaims ?? summary.externally_verified_claims);
    this.labeledList(copy(this.language, '待外部核验', 'Needs external verification'), summary.pendingVerificationClaims ?? summary.pending_verification_claims);
    this.labeledList(copy(this.language, '暂无法确认', 'Unable to verify'), summary.unableToVerifyClaims ?? summary.unable_to_verify_claims);
  }

  private onlineVerification(report: ReportItem) {
    const online = (report.onlineVerification ?? report.online_verification ?? report.web_verification ?? {}) as ReportItem;
    const groups: Array<[string, unknown]> = [[copy(this.language, '已核验来源', 'Verified sources'), online.verifiedSources ?? online.verified_sources], [copy(this.language, '相关背景来源', 'Background sources'), online.backgroundSources ?? online.background_sources], [copy(this.language, '待核验线索', 'Leads to verify'), online.pendingLeads ?? online.pending_leads]];
    groups.forEach(([label, value]) => {
      if (!items(value).length) return;
      this.subheading(label);
      this.items(value);
    });
    this.labeledList(copy(this.language, '暂无法确认的信息', 'Information that remains unconfirmed'), online.unableToConfirm ?? online.unable_to_confirm);
  }

  private metadata() {
    const rows: Array<[string, string]> = [[copy(this.language, '新闻标题', 'Article title'), this.audit.title], [copy(this.language, '新闻来源', 'Source'), this.audit.source || '-'], [copy(this.language, '发布时间', 'Published at'), this.audit.publishedAt || '-'], [copy(this.language, '使用模型', 'Model'), this.audit.modelName || '-'], [copy(this.language, '思考强度', 'Reasoning depth'), this.audit.reasoningDepth || '-'], [copy(this.language, '报告语言', 'Report language'), this.audit.reportLanguage || '-'], [copy(this.language, '报告版本', 'Report version'), `v${this.audit.reportVersion}`], [copy(this.language, '生成时间', 'Generated at'), this.audit.createdAt.toISOString()], [copy(this.language, '方法论', 'Methodology'), copy(this.language, '观隅九镜审读法', 'Guanyu Nine-Lens Reading')]];
    rows.forEach(([label, value]) => this.labeledParagraph(label, value, 9.3));
  }

  private headersAndFooters() {
    const range = this.doc.bufferedPageRange();
    const total = range.count;
    for (let index = range.start; index < range.start + range.count; index += 1) {
      if (index === 0) continue;
      this.doc.switchToPage(index);
      // PDFKit otherwise interprets a footer below the normal text margin as
      // overflow and silently creates a blank page for every footer.
      const originalBottomMargin = this.doc.page.margins.bottom;
      this.doc.page.margins.bottom = 0;
      // The footer has an independent font subset so page finishing cannot
      // remap glyphs that were already written by the report body.
      this.doc.font(this.auxiliaryFontName).fontSize(7.1).fillColor(MUTED).text('GUANYU | NEWS NARRATIVE REVIEW REPORT', PAGE.left, PAGE.height - 34, { width: this.width - 72 });
      this.doc.font(this.auxiliaryFontName).fontSize(7.1).fillColor(MUTED).text(`${index + 1} / ${total}`, PAGE.width - PAGE.right - 48, PAGE.height - 34, { width: 48, align: 'right' });
      this.doc.font(this.auxiliaryFontName).fontSize(6.5).fillColor(MUTED).text(`v${this.audit.reportVersion} | ${this.audit.createdAt.toISOString().slice(0, 10)}`, PAGE.left, PAGE.height - 20, { width: this.width });
      this.doc.page.margins.bottom = originalBottomMargin;
    }
  }

  render(report: ReportItem, contentsOverride?: Array<{ title: string; page: number }>) {
    const online = (report.onlineVerification ?? report.online_verification ?? report.web_verification ?? {}) as ReportItem;
    const sources = [...items(online.verifiedSources ?? online.verified_sources), ...items(online.backgroundSources ?? online.background_sources), ...items(online.pendingLeads ?? online.pending_leads)];
    sources.forEach((source, index) => {
      const key = plain(source.url ?? source.sourceUrl ?? source.source_url ?? source.title);
      if (key) this.sourceNumbers.set(key, index + 1);
    });

    this.cover(report);
    this.addPage(false);
    if (contentsOverride) this.writeContents(contentsOverride);
    this.addPage(true);
    this.heading(copy(this.language, '摘要', 'Abstract'));
    this.paragraph(this.audit.newsSummary, { size: 10.2 });
    this.labeledParagraph(copy(this.language, '核心结论', 'Core conclusion'), report.oneSentenceConclusion ?? report.one_sentence_conclusion, 10);
    this.labeledParagraph(copy(this.language, '关键词', 'Keywords'), [this.audit.source, this.audit.modelName, report.methodology ?? copy(this.language, '观隅九镜审读法', 'Guanyu Nine-Lens Reading')].filter(Boolean).join(isChinese(this.language) ? '；' : '; '), 8.8);
    this.heading(copy(this.language, '1. 原文解读', '1. Reading the article'));
    this.sourceInterpretation(report);
    this.heading(copy(this.language, '2. 阅读价值与读法', '2. Reading value and approach'));
    this.readingAssessment(report);
    this.heading(copy(this.language, '3. 核心指标与评分理由', '3. Core indicators and score rationale'));
    this.metrics(report);
    this.heading(copy(this.language, '4. 结论分层', '4. Layers of conclusion'));
    this.conclusionLayers(report);

    const contentSections: Array<[string, unknown, 'items' | 'bullets' | 'paragraph']> = [
      [copy(this.language, '5. 关键发现', '5. Key findings'), report.keyFindings ?? report.key_findings, 'items'],
      [copy(this.language, '6. 支持原文叙事的证据', '6. Evidence supporting the article narrative'), report.supportingEvidence ?? report.narrative_supporting_evidence, 'items'],
      [copy(this.language, '7. 信息缺口', '7. Information gaps'), report.informationGaps ?? report.major_information_gaps, 'items'],
      [copy(this.language, '8. 关键利益关系', '8. Key interest relationships'), report.stakeholderRelations ?? report.interestRelationships ?? (report.nine_mirror_review as ReportItem | undefined)?.interest_cost_map, 'items'],
      [copy(this.language, '9. 替代解释', '9. Alternative explanations'), report.alternativeExplanations ?? report.alternative_explanations ?? (report.nine_mirror_review as ReportItem | undefined)?.alternative_explanation_comparison, 'items'],
    ];
    for (const [title, value, kind] of contentSections) {
      const hasContent = kind === 'items' ? items(value).length > 0 : kind === 'bullets' ? Array.isArray(value) && value.length > 0 : Boolean(plain(value));
      if (!hasContent) continue;
      this.heading(title);
      if (kind === 'items') this.items(value);
      else if (kind === 'bullets') this.labeledList(copy(this.language, '问题清单', 'Questions'), value);
      else this.paragraph(value);
    }
    const evidenceSummary = report.evidenceVerificationSummary ?? report.evidence_verification_summary;
    if (evidenceSummary && typeof evidenceSummary === 'object') {
      this.heading(copy(this.language, '10. 证据与核验状态', '10. Evidence and verification state'));
      this.evidenceSummary(report);
    }
    const roadmap = report.verificationRoadmap ?? report.verification_roadmap ?? (report.nine_mirror_review as ReportItem | undefined)?.verification_roadmap;
    if (items(roadmap).length) {
      this.heading(copy(this.language, '11. 验证路线图', '11. Verification roadmap'));
      this.items(roadmap);
    }
    if (Object.keys(online).length) {
      this.heading(copy(this.language, '12. 联网核验结果', '12. Web verification results'));
      this.onlineVerification(report);
    }
    const followUpQuestions = report.questionsToAsk ?? report.questions_to_ask_next;
    if (Array.isArray(followUpQuestions) && followUpQuestions.length) {
      this.heading(copy(this.language, '13. 继续追问清单', '13. Questions to ask next'));
      this.labeledList(copy(this.language, '问题清单', 'Questions'), followUpQuestions);
    }
    const cannotConclude = report.cannotConclude ?? report.cannot_conclude;
    const riskNotice = report.riskNotice ?? report.risk_notice;
    if (Array.isArray(cannotConclude) || plain(riskNotice)) {
      this.heading(copy(this.language, '14. 解读边界与风险提示', '14. Interpretation boundary and risk notice'));
      this.labeledList(copy(this.language, '目前不能直接得出的结论', 'Conclusions not yet supported'), cannotConclude);
      this.labeledParagraph(copy(this.language, '风险提示', 'Risk notice'), riskNotice);
    }
    const completion = this.audit.completionMarkdown ?? report.completionMarkdown;
    if (plain(completion)) {
      this.heading(copy(this.language, '15. AI 补充分析', '15. AI supplementary analysis'));
      this.paragraph(completion);
    }
    this.heading(copy(this.language, '16. 报告元信息', '16. Report metadata'));
    this.metadata();
    if (sources.length) {
      this.heading(copy(this.language, '参考来源', 'References'));
      sources.forEach((source, index) => {
        this.ensureSpace(78);
        this.useFont(9).text(`[S${index + 1}] ${itemTitle(source)}`, { width: this.width, lineGap: 2 });
        const body = itemBody(source);
        if (body && body !== itemTitle(source)) this.paragraph(body, { size: 8.7, color: MUTED, gap: 0.25 });
        const url = plain(source.url ?? source.sourceUrl ?? source.source_url);
        if (url) this.useFont(8.3, MUTED).text(url, { width: this.width, link: url, underline: false, lineGap: 2 });
        this.doc.moveDown(0.6);
      });
    }
    this.addPage(true);
    this.heading(copy(this.language, '附录 A：新闻原文', 'Appendix A: original article'));
    this.paragraph(reportAppendix(this.audit.originalContent, this.language), { size: 9.1, gap: 0 });
    this.headersAndFooters();
    return this.contents;
  }
}

async function renderPass(audit: AuditForPdf, language: string, contentsOverride?: Array<{ title: string; page: number }>) {
  if (!fs.existsSync(FONT_PATH)) throw new Error('PDF 字体文件不可用。');
  const document = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: 'A4', margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right }, info: { Title: audit.title, Author: '观隅 / Guanyu', Subject: copy(language, '新闻叙事审视报告', 'News Narrative Review Report'), Keywords: `Guanyu, news narrative review, ${audit.id}`, CreationDate: audit.createdAt } });
  // Never use PDFKit's built-in Helvetica: its AFM file is omitted by some
  // serverless tracing bundles. Both embedded subsets come from our deployed
  // font file and remain available in local and Vercel runtimes.
  document.registerFont('GuanyuBody', FONT_PATH);
  document.registerFont('GuanyuAuxiliary', FONT_PATH);
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  const contents = new AcademicPdf(document, audit, language).render(parseReport(audit), contentsOverride);
  document.end();
  return { buffer: await output, contents };
}

export async function renderProfessionalPdf(audit: AuditForPdf): Promise<Buffer> {
  const language = audit.reportLanguage || 'zh-CN';
  // The first pass captures stable pagination. The final pass writes the
  // directory before body text so CJK glyph mappings cannot be invalidated.
  const pagination = await renderPass(audit, language);
  const final = await renderPass(audit, language, pagination.contents);
  return final.buffer;
}

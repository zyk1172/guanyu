import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { exportItems, exportPlainText, parseExportReport, type ExportReportItem } from '@/lib/report-export-content';

export type AuditForWord = {
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

type Report = ExportReportItem;
type ReportItem = ExportReportItem;

const PAGE_WIDTH = 9360;
const MAX_ITEM_CHARS = 2_000;
const MAX_APPENDIX_CHARS = 32_000;
// Apple Office and LibreOffice both resolve these installed CJK families. The
// Latin fields retain a conventional report face while eastAsia keeps Chinese
// (and the CJK fallbacks) readable without requiring a bundled font file.
const SERIF = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: 'Songti SC' };
const SANS = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'PingFang SC' };
const BLACK = '111111';
const MID = '4B5563';
const LIGHT = 'F3F4F6';
const RULE = 'A3A3A3';

function isChinese(language: string) {
  return language.toLowerCase().startsWith('zh');
}

function copy(language: string, zh: string, en: string) {
  return isChinese(language) ? zh : en;
}

const text = exportPlainText;

function truncate(value: string, max = MAX_ITEM_CHARS) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const itemList = exportItems;

function itemTitle(item: ReportItem) {
  return truncate(text(item.title ?? item.supportsNarrative ?? item.supports_narrative ?? item.role ?? item.actor ?? item.question ?? item.target ?? item.explanation ?? item.perspective ?? item.content ?? item.description), 380) || '-';
}

function itemBody(item: ReportItem) {
  return truncate(text(item.content ?? item.detail ?? item.description ?? item.reason ?? item.snippet ?? item.whyItMatters ?? item.why_it_matters));
}

function label(language: string, key: string) {
  const labels: Record<string, [string, string]> = {
    judgmentType: ['判断类型', 'Judgment type'], evidenceGrade: ['证据等级', 'Evidence grade'], verificationStatus: ['核验状态', 'Verification status'], speculationRisk: ['推测不确定性', 'Speculation uncertainty'], whyItMatters: ['重要性', 'Why it matters'], nextVerification: ['下一步核验', 'Next verification'], limitation: ['局限', 'Limitation'], possibleBenefit: ['可能利益', 'Potential benefit'], possibleCost: ['可能代价', 'Potential cost'], currentEvidenceStatus: ['当前证据', 'Current evidence'], neededVerification: ['需要核验', 'Required verification'], materialType: ['材料类型', 'Material type'], priority: ['优先级', 'Priority'], source: ['来源', 'Source'],
  };
  return labels[key]?.[isChinese(language) ? 0 : 1] ?? key;
}

function localized(language: string, value: unknown) {
  const raw = text(value);
  const values: Record<string, [string, string]> = {
    source_supported: ['原文支持', 'Supported by the article'], externally_verified: ['外部已核验', 'Externally verified'], partially_supported: ['部分支持', 'Partially supported'], pending_verification: ['待核验', 'Pending verification'], unable_to_verify: ['暂无法确认', 'Unable to verify'],
    '原文支持': ['原文支持', 'Supported by the article'], '外部已核验': ['外部已核验', 'Externally verified'], '部分支持': ['部分支持', 'Partially supported'], '待核验': ['待核验', 'Pending verification'], '暂无法确认': ['暂无法确认', 'Unable to verify'],
    high: ['高', 'High'], medium: ['中', 'Medium'], low: ['低', 'Low'], '高': ['高', 'High'], '中': ['中', 'Medium'], '低': ['低', 'Low'],
  };
  return values[raw]?.[isChinese(language) ? 0 : 1] ?? raw;
}

function safeUrl(value: unknown) {
  const candidate = text(value);
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function paragraph(value: unknown, options: { bold?: boolean; size?: number; color?: string; style?: string; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; pageBreakBefore?: boolean; spacing?: { before?: number; after?: number; line?: number }; keepNext?: boolean } = {}) {
  return new Paragraph({
    style: options.style,
    pageBreakBefore: options.pageBreakBefore,
    keepNext: options.keepNext,
    alignment: options.alignment,
    spacing: options.spacing ?? { after: 120, line: 330 },
    children: [new TextRun({ text: truncate(text(value), MAX_ITEM_CHARS * 6), bold: options.bold, size: options.size, color: options.color, font: SERIF })],
  });
}

function heading(value: string, level: 1 | 2 | 3, pageBreakBefore = false) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    pageBreakBefore,
    keepNext: true,
    spacing: { before: level === 1 ? 0 : 260, after: 140, line: 360 },
    children: [new TextRun({ text: value, font: SANS, color: BLACK, bold: true })],
  });
}

function bullet(value: unknown) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70, line: 300 },
    children: [new TextRun({ text: truncate(text(value)), font: SERIF, color: BLACK, size: 20 })],
  });
}

function cell(value: unknown, options: { bold?: boolean; shade?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.shade ? { type: ShadingType.CLEAR, fill: options.shade } : undefined,
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: [new Paragraph({
      alignment: options.align,
      spacing: { after: 0, line: 280 },
      children: [new TextRun({ text: truncate(text(value), 900), bold: options.bold, color: BLACK, size: 18, font: SERIF })],
    })],
  });
}

function table(headers: string[], rows: Array<Array<unknown>>, widths: number[]) {
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    indent: { size: 0, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: {
      top: { style: BorderStyle.SINGLE, color: RULE, size: 6 }, bottom: { style: BorderStyle.SINGLE, color: RULE, size: 6 },
      left: { style: BorderStyle.SINGLE, color: RULE, size: 4 }, right: { style: BorderStyle.SINGLE, color: RULE, size: 4 },
      insideHorizontal: { style: BorderStyle.SINGLE, color: 'D4D4D4', size: 3 }, insideVertical: { style: BorderStyle.SINGLE, color: 'D4D4D4', size: 3 },
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((header, index) => cell(header, { bold: true, shade: LIGHT, width: widths[index], align: AlignmentType.CENTER })) }),
      ...rows.map((row) => new TableRow({ cantSplit: true, children: row.map((value, index) => cell(value, { width: widths[index] })) })),
    ],
  });
}

function sectionItems(title: string, value: unknown, language: string, description?: string) {
  const items = itemList(value);
  if (!items.length) return [] as Array<Paragraph | Table>;
  const children: Array<Paragraph | Table> = [heading(title, 2)];
  if (description) children.push(paragraph(description, { color: MID }));
  items.forEach((item, index) => {
    children.push(new Paragraph({ keepNext: true, spacing: { before: 90, after: 60, line: 300 }, children: [new TextRun({ text: `${index + 1}. ${itemTitle(item)}`, font: SERIF, bold: true, size: 21, color: BLACK })] }));
    const body = itemBody(item);
    if (body && body !== itemTitle(item)) children.push(paragraph(body, { spacing: { after: 60, line: 310 } }));
    const meta = ['judgmentType', 'evidenceGrade', 'verificationStatus', 'speculationRisk', 'whyItMatters', 'nextVerification', 'limitation', 'possibleBenefit', 'possibleCost', 'currentEvidenceStatus', 'neededVerification']
      .map((key) => text(item[key]) ? `${label(language, key)}: ${localized(language, item[key])}` : '')
      .filter(Boolean);
    if (meta.length) children.push(paragraph(meta.join(' | '), { size: 17, color: MID, spacing: { after: 90, line: 260 } }));
  });
  return children;
}

function score(report: Report, ...keys: string[]) {
  const scores = (report.scores ?? report.scoreSummary ?? report.score_summary ?? {}) as ReportItem;
  for (const key of keys) {
    const value = scores[key];
    if (typeof value === 'number' || typeof value === 'string') return String(value);
  }
  return '-';
}

function sourceRows(report: Report, language: string) {
  const online = (report.onlineVerification ?? report.online_verification ?? report.web_verification ?? {}) as ReportItem;
  const groups: Array<[string, unknown]> = [
    [copy(language, '已核验来源', 'Verified sources'), online.verifiedSources ?? online.verified_sources],
    [copy(language, '相关背景来源', 'Background sources'), online.backgroundSources ?? online.background_sources],
    [copy(language, '待核验线索', 'Pending verification leads'), online.pendingLeads ?? online.pending_leads],
  ];
  const rows: Array<Array<unknown>> = [];
  groups.forEach(([group, collection]) => itemList(collection).forEach((item) => {
    const url = safeUrl(item.url);
    rows.push([group, itemTitle(item), text(item.snippet ?? item.description ?? item.content), text(item.evidenceGrade ?? item.evidence_grade), localized(language, item.verificationStatus ?? item.verification_status), url ?? '']);
  }));
  return rows;
}

function sourceParagraphs(rows: Array<Array<unknown>>) {
  if (!rows.length) return [] as Paragraph[];
  const result: Paragraph[] = [];
  rows.forEach((row, index) => {
    const url = safeUrl(row[5]);
    result.push(new Paragraph({ spacing: { after: 80, line: 300 }, children: [
      new TextRun({ text: `[${index + 1}] ${text(row[1])}. `, font: SERIF, bold: true, color: BLACK, size: 19 }),
      new TextRun({ text: `${text(row[0])}; ${text(row[2])} `, font: SERIF, color: MID, size: 19 }),
      ...(url ? [new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, font: SERIF, color: '1A5A8A', underline: { type: 'single' }, size: 18 })] })] : []),
    ] }));
  });
  return result;
}

function appendix(content: string, language: string) {
  if (content.length <= MAX_APPENDIX_CHARS) return content;
  return `${content.slice(0, MAX_APPENDIX_CHARS)}\n\n${copy(language, `[为保证文档稳定生成，附录仅保留原文前 ${MAX_APPENDIX_CHARS.toLocaleString('zh-CN')} 字；完整原文仍可在观隅页面查阅。]`, `[For reliable document generation, this appendix includes the first ${MAX_APPENDIX_CHARS.toLocaleString('en-US')} characters. The complete source remains available in Guanyu.]`)}`;
}

export async function renderProfessionalWord(audit: AuditForWord) {
  const language = audit.reportLanguage || 'zh-CN';
  const report = parseExportReport(audit.auditResultJson);
  const title = copy(language, '观隅 · 新闻叙事审视报告', 'Guanyu · News Narrative Review Report');
  const now = audit.createdAt.toISOString().slice(0, 10);
  const sourceTableRows = sourceRows(report, language);
  const source = (report.sourceInterpretation ?? report.source_interpretation ?? {}) as ReportItem;
  const conclusion = text(report.oneSentenceConclusion ?? report.one_sentence_conclusion) || copy(language, '当前材料不足，无法形成可靠判断。', 'The available material is insufficient for a reliable conclusion.');
  const documentControl = [
    [copy(language, '报告编号', 'Report ID'), audit.id], [copy(language, '版本', 'Version'), String(audit.reportVersion)],
    [copy(language, '生成时间', 'Generated'), audit.createdAt.toISOString()], [copy(language, '语言', 'Language'), audit.reportLanguage],
    [copy(language, '分析方法', 'Method'), text(report.methodology) || copy(language, '观隅九镜审读法', 'Guanyu Nine-Lens Reading')], [copy(language, '生成模型', 'Model'), audit.modelName],
  ];
  // Cached entries keep the table readable in LibreOffice and preview tools.
  // Word treats this as a normal native TOC field and refreshes actual pages
  // when the document is opened or fields are updated.
  const tocEntries = [
    copy(language, '文档控制', 'Document control'), copy(language, '目录', 'Table of contents'), copy(language, '执行摘要', 'Executive summary'),
    copy(language, '新闻事件与原始主张', 'News event and original claims'), copy(language, '证据评估', 'Evidence assessment'),
    copy(language, '叙事结构与倾向分析', 'Narrative structure and framing'), copy(language, '风险与不确定性', 'Risk and uncertainty'),
    copy(language, '验证路线图', 'Verification roadmap'), copy(language, 'AI 补充分析', 'AI supplementary analysis'),
    copy(language, 'AI 追问记录', 'AI follow-up record'), copy(language, '来源与引用', 'Sources and references'),
    copy(language, '方法说明', 'Method note'), copy(language, '附录：新闻原文', 'Appendix: original article'),
  ].map((entry) => ({ title: entry, level: 1 }));

  const children: Array<Paragraph | Table | TableOfContents> = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2200, after: 260 }, children: [new TextRun({ text: 'GUANYU', font: SANS, bold: true, size: 34, color: BLACK, characterSpacing: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 520 }, children: [new TextRun({ text: title, font: SANS, bold: true, size: 42, color: BLACK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [new TextRun({ text: audit.title, font: SERIF, size: 27, color: MID })] }),
    table([copy(language, '项目', 'Item'), copy(language, '信息', 'Information')], [
      [copy(language, '新闻来源', 'Source'), audit.source || copy(language, '未提供', 'Not provided')],
      [copy(language, '新闻发布时间', 'Published'), audit.publishedAt || copy(language, '未能可靠识别', 'Not reliably identified')],
      [copy(language, '报告编号', 'Report ID'), audit.id],
      [copy(language, '报告版本', 'Report version'), String(audit.reportVersion)],
      [copy(language, '报告语言', 'Report language'), audit.reportLanguage],
    ], [2300, 7060]),
    new Paragraph({ spacing: { before: 600, after: 0, line: 300 }, children: [new TextRun({ text: copy(language, '本报告基于公开信息及系统分析生成，旨在辅助事实核验、叙事审视和风险研判，不构成法律、投资或其他专业意见。', 'This report is generated from publicly available information and analytical processing. It is intended to support factual review, narrative assessment, and risk analysis, and does not constitute legal, investment, or other professional advice.'), font: SERIF, color: MID, size: 18, italics: true })] }),
    new Paragraph({ children: [new PageBreak()] }),
    heading(copy(language, '文档控制', 'Document control'), 1),
    table([copy(language, '字段', 'Field'), copy(language, '内容', 'Content')], documentControl, [2300, 7060]),
    heading(copy(language, '目录', 'Table of contents'), 1, true),
    new TableOfContents(copy(language, '目录', 'Contents'), { hyperlink: true, headingStyleRange: '1-3', beginDirty: true, cachedEntries: tocEntries }),
    heading(copy(language, '执行摘要', 'Executive summary'), 1, true),
    paragraph(audit.newsSummary || text(source.whatItSays) || copy(language, '报告未提供可用摘要。', 'No usable summary was provided.')),
    heading(copy(language, '一句话结论', 'One-sentence conclusion'), 2),
    paragraph(conclusion, { bold: true, size: 22 }),
    heading(copy(language, '核心指标总览', 'Core metrics'), 2),
    table([copy(language, '指标', 'Metric'), copy(language, '数值', 'Score'), copy(language, '释义', 'Interpretation')], [
      [copy(language, '可信度', 'Credibility'), `${score(report, 'credibility', 'credibilityScore')}/100`, copy(language, '越高表示原文主张越有可追溯支撑。', 'Higher indicates more traceable support for the article’s claims.')],
      [copy(language, '信息完整度', 'Information completeness'), `${score(report, 'informationCompleteness', 'information_completeness')}/100`, copy(language, '越高表示关键事实、范围和口径披露越完整。', 'Higher indicates fuller disclosure of material facts, scope, and methods.')],
      [copy(language, '叙事倾向性', 'Narrative framing'), `${score(report, 'narrativeBias', 'narrative_bias')}/100`, copy(language, '越高表示引导性表达或单向框架越明显。', 'Higher indicates stronger directional framing.')],
      [copy(language, '证据强度', 'Evidence strength'), `${score(report, 'evidenceStrength', 'evidence_strength')}/100`, copy(language, '越高表示可核验材料越充分。', 'Higher indicates more sufficient verifiable evidence.')],
      [copy(language, '推测不确定性', 'Speculation uncertainty'), `${score(report, 'speculationRisk', 'speculation_risk')}/100`, copy(language, '越高表示应更谨慎区分假设与事实。', 'Higher calls for greater caution in distinguishing hypotheses from facts.')],
    ], [2600, 1300, 5460]),
    ...sectionItems(copy(language, '关键发现', 'Key findings'), report.keyFindings ?? report.key_findings, language),
    heading(copy(language, '新闻事件与原始主张', 'News event and original claims'), 1, true),
    paragraph(text(source.whatItSays) || audit.newsSummary),
    ...sectionItems(copy(language, '核心主张', 'Core claims'), source.coreClaims ?? source.core_claims, language),
    ...sectionItems(copy(language, '原文关键证据', 'Key evidence in the article'), source.keyEvidence ?? source.key_evidence, language),
    heading(copy(language, '证据评估', 'Evidence assessment'), 1, true),
    table([copy(language, '核心主张', 'Claim'), copy(language, '支持证据', 'Evidence'), copy(language, '来源', 'Source'), copy(language, '强度', 'Strength'), copy(language, '当前状态', 'Current status')], [
      ...itemList(report.supportingEvidence ?? report.narrative_supporting_evidence).map((item) => [itemTitle(item), itemBody(item), text(item.source ?? item.sourceName ?? copy(language, '报告材料', 'Report material')), text(item.evidenceGrade ?? item.evidence_grade ?? '-'), localized(language, item.verificationStatus ?? item.verification_status ?? '-')]),
      ...itemList(report.keyFindings ?? report.key_findings).map((item) => [itemTitle(item), itemBody(item), text(item.source ?? copy(language, '报告材料', 'Report material')), text(item.evidenceGrade ?? item.evidence_grade ?? '-'), localized(language, item.verificationStatus ?? item.verification_status ?? '-')]),
    ].filter((row) => text(row[0]) !== '-'), [2600, 2750, 1500, 950, 1560]),
    heading(copy(language, '叙事结构与倾向分析', 'Narrative structure and framing'), 1, true),
    paragraph(text(source.narrativeStyle ?? source.narrative_style) || copy(language, '报告未提供叙事结构说明。', 'The report does not provide a narrative-structure note.')),
    ...sectionItems(copy(language, '主要信息缺口', 'Major information gaps'), report.informationGaps ?? report.major_information_gaps, language),
    ...sectionItems(copy(language, '关键利益关系', 'Key interest relationships'), report.interestRelationships ?? report.stakeholderRelations ?? ((report.nine_mirror_review as ReportItem | undefined)?.interest_cost_map), language),
    ...sectionItems(copy(language, '替代解释', 'Alternative explanations'), report.alternativeExplanations ?? report.alternative_explanations, language),
    heading(copy(language, '风险与不确定性', 'Risk and uncertainty'), 1, true),
    table([copy(language, '风险层级', 'Risk level'), copy(language, '说明', 'Explanation')], [
      [copy(language, '高', 'High'), text(report.riskNotice ?? report.risk_notice) || copy(language, '高风险判断必须有外部可复核材料支持；当前缺口应明确保留。', 'High-risk judgments require externally reviewable material; unresolved gaps remain explicit.')],
      [copy(language, '中', 'Medium'), copy(language, '基于原文可作合理推断，但不得当作既成事实。', 'A reasonable inference from the article, but not an established fact.')],
      [copy(language, '低', 'Low'), copy(language, '原文明确陈述或有相对可追溯材料支持的基础信息。', 'Basic information explicitly stated in the article or supported by traceable material.')],
    ], [1650, 7710]),
    heading(copy(language, '验证路线图', 'Verification roadmap'), 1, true),
    ...sectionItems(copy(language, '优先核验事项', 'Priority verification items'), report.verificationRoadmap ?? report.verification_roadmap, language),
    heading(copy(language, 'AI 补充分析', 'AI supplementary analysis'), 1, true),
    paragraph(audit.completionMarkdown || text(report.completionMarkdown) || copy(language, '当前报告尚无 AI 补全内容。', 'No AI completion has been generated for this report.')),
    heading(copy(language, 'AI 追问记录', 'AI follow-up record'), 1, true),
    paragraph(copy(language, '当前版本未保存独立的追问问答记录；下列为报告建议继续追问的问题。', 'This version does not store a separate follow-up conversation record; the following are the report’s recommended questions.')),
    ...itemList(report.questionsToAsk ?? report.questions_to_ask_next).map((item) => bullet(itemTitle(item))),
    heading(copy(language, '来源与引用', 'Sources and references'), 1, true),
    ...sourceParagraphs(sourceTableRows),
    heading(copy(language, '方法说明', 'Method note'), 1, true),
    paragraph(text(report.methodology) || copy(language, '观隅九镜审读法：将新闻中的事实、主张、证据、叙事结构、缺席视角、利益关系、因果链、替代解释与验证路径分开审视。系统不替用户断言真相；证据到哪里，判断到哪里。', 'Guanyu Nine-Lens Reading separates facts, claims, evidence, narrative structure, missing perspectives, interests, causal chains, alternative explanations, and verification paths. The system does not declare truth for the reader: judgment extends only as far as evidence permits.')),
    heading(copy(language, '附录：新闻原文', 'Appendix: original article'), 1, true),
    paragraph(appendix(audit.originalContent || copy(language, '未提供原始新闻正文。', 'The original article text was not provided.'), language), { spacing: { after: 100, line: 330 } }),
  ];

  const doc = new Document({
    creator: '观隅 / Guanyu',
    title: `${title} — ${audit.title}`,
    subject: copy(language, '新闻叙事审视与证据评估', 'News narrative review and evidence assessment'),
    keywords: `Guanyu,news narrative review,evidence assessment,${audit.id}`,
    description: copy(language, '观隅正式新闻叙事审视报告', 'Guanyu formal news narrative review report'),
    revision: audit.reportVersion,
    customProperties: [
      { name: 'Company', value: '观隅 / Guanyu' }, { name: 'Category', value: 'Narrative Intelligence Report' }, { name: 'Language', value: audit.reportLanguage }, { name: 'Version', value: String(audit.reportVersion) }, { name: 'Report ID', value: audit.id },
    ],
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: SERIF, size: 21, color: BLACK }, paragraph: { spacing: { after: 120, line: 330 } } }, heading1: { run: { font: SANS, size: 31, bold: true, color: BLACK }, paragraph: { spacing: { before: 0, after: 170 } } }, heading2: { run: { font: SANS, size: 25, bold: true, color: BLACK }, paragraph: { spacing: { before: 260, after: 140 } } }, heading3: { run: { font: SANS, size: 22, bold: true, color: BLACK }, paragraph: { spacing: { before: 180, after: 100 } } } },
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, right: 1080, bottom: 1080, left: 1080 } } },
      headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, color: RULE, size: 6, space: 5 } }, spacing: { after: 60 }, children: [new TextRun({ text: 'GUANYU  |  NARRATIVE INTELLIGENCE', font: SANS, size: 16, color: MID, bold: true }), new TextRun({ text: `                                                                 ${audit.id}`, font: SANS, size: 15, color: MID })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: `${copy(language, '观隅 · 仅供研究与事实核验辅助', 'Guanyu · For research and factual review support only')}  |  `, font: SERIF, size: 15, color: MID }), new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: SERIF, size: 15, color: MID }), new TextRun({ text: `  |  guanyu-seven.vercel.app  |  ${now}`, font: SERIF, size: 15, color: MID })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

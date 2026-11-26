import { readCompletionArticle } from './ai-completion-core.mjs';
import { exportAppendixNotice, exportCopy, exportDisclaimer, exportFieldLabel, exportLocalizedValue, getExportBrand, normalizeExportLanguage } from './export-language-core.mjs';
import { hasToolCallMarkup } from './model-output';
import { formatJudgmentType, formatMaterialType, formatUnconfirmedItem, formatVerificationStatus, getReportText } from './report-display-core.mjs';
import { emphasizeReportMarkdown, emphasizeReportTextMarkdown, normalizeEmphasisPhrases } from './report-emphasis';

export type ExportAudit = {
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

export type ExportFollowup = { question: string; answer: string; sources: unknown; createdAt?: Date };
export type ExportOptions = { followups?: ExportFollowup[]; includeOriginal?: boolean };
export type ExportLink = { label: string; href: string };
export type ExportEntry = { heading?: string; body?: string; detail?: string; links?: ExportLink[]; verbatim?: boolean };
export type ExportSection = { title: string; entries: ExportEntry[] };
export type ExportBar = { label: string; value: number };
export type ExportMetric = ExportBar & { reason: string };
type ReportItem = Record<string, unknown>;

const MAX_APPENDIX_CHARS = 32_000;

function record(value: unknown): ReportItem {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ReportItem : {};
}

function parseReport(value: string) {
  try {
    return record(JSON.parse(value));
  } catch {
    return {};
  }
}

function items(value: unknown): ReportItem[] {
  return Array.isArray(value) ? value.map(item => typeof item === 'string' ? { content: item } : record(item)) : [];
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\u0000/g, '').trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function field(item: ReportItem, ...keys: string[]) {
  for (const key of keys) {
    const value = text(item[key]);
    if (value) return value;
  }
  return '';
}

function url(value: unknown) {
  try {
    const parsed = new URL(text(value));
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '';
  } catch {
    return '';
  }
}

function dateLabel(value: string, language: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language, {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(date);
}

function cleanAppendix(value: string, language: string) {
  const clean = text(value.split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    return !/^(?:loading(?:\.{3}|…)|(?:hide|show) caption)$/i.test(trimmed)
      && !/^(?:Midterms coverage|Stay connected):.+\|/i.test(trimmed);
  }).join('\n'));
  return clean.length <= MAX_APPENDIX_CHARS ? clean
    : clean.slice(0, MAX_APPENDIX_CHARS) + exportAppendixNotice(language, MAX_APPENDIX_CHARS);
}

export function buildReportExport(audit: ExportAudit, options: ExportOptions = {}) {
  const language = normalizeExportLanguage(audit.reportLanguage);
  const label = (zh: string, en: string) => exportCopy(language, zh, en);
  const reportText = (key: string) => getReportText(key, language);
  const report = parseReport(audit.auditResultJson);
  const source = record(report.sourceInterpretation ?? report.source_interpretation);
  const mirror = record(report.nine_mirror_review);
  const framing = record(mirror.narrative_frame_analysis);
  const layers = record(report.conclusionLayers ?? report.conclusion_layers);
  const verification = record(report.evidenceVerificationSummary ?? report.evidence_verification_summary);
  const online = record(report.onlineVerification ?? report.online_verification ?? report.web_verification);
  const findings = items(report.keyFindings ?? report.key_findings ?? report.mainNarrativeIssues);
  const evidence = items(report.supportingEvidence ?? report.narrative_supporting_evidence);
  const gaps = items(report.informationGaps ?? report.major_information_gaps ?? report.mainInformationGaps);
  const scoreValues = record(report.scores ?? report.scoreSummary ?? report.score_summary);
  const scoreReasons = record(report.scoreReasons ?? report.score_reasons ?? scoreValues.score_reasoning);
  const scoreFields = [
    ['credibility', 'credibility_score', '可信度', 'Credibility'],
    ['informationCompleteness', 'information_completeness', '信息完整度', 'Information completeness'],
    ['narrativeBias', 'narrative_bias', '叙事倾向性', 'Narrative framing'],
    ['evidenceStrength', 'evidence_strength', '证据强度', 'Evidence strength'],
    ['speculationRisk', 'speculation_risk', '推测不确定性', 'Speculation uncertainty'],
  ] as const;
  const metrics: ExportMetric[] = scoreFields.flatMap(([key, legacy, zh, en]) => {
    const raw = field(scoreValues, key, legacy, `${legacy}_score`, `${key}Score`) || field(report, `${key}Score`);
    const value = Number(raw);
    return raw && Number.isFinite(value) && value >= 0 && value <= 100
      ? [{ label: label(zh, en), value, reason: field(scoreReasons, key, legacy, `${legacy}_score`) }]
      : [];
  });
  const gradeCounts = ['A', 'B', 'C', 'D', 'E'].map(grade => ({
    label: grade, value: [...findings, ...evidence, ...gaps].filter(item =>
      field(item, 'evidenceGrade', 'evidence_grade', 'currentEvidenceGrade', 'current_evidence_grade') === grade,
    ).length,
  }));

  const references = new Map<string, ExportEntry & { links: [ExportLink] }>();
  function reference(item: ReportItem, context?: string, title = ''): ExportLink | undefined {
    const href = url(item.url) || url(item.sourceUrl ?? item.source_url ?? item.sourceReference ?? item.source_reference);
    if (!href) return;
    const detail = [...new Set([
      formatVerificationStatus(field(item, 'verificationStatus', 'verification_status'), language),
      field(item, 'relevance'), field(item, 'note', 'snippet', 'description'),
    ].filter(Boolean))].join(' · ');
    const existing = references.get(href);
    if (existing) {
      if (detail && !existing.detail) existing.detail = detail;
      return existing.links[0];
    }
    const link = { label: `S${references.size + 1}`, href };
    const displayName = field(item, 'title', 'source', 'sourceName') || title || new URL(href).hostname;
    references.set(href, { heading: displayName, detail: [context, detail].filter(Boolean).join(' · '), links: [link] });
    return link;
  }

  for (const [group, context] of [
    [online.verifiedSources ?? online.verified_sources, ''],
    [online.backgroundSources ?? online.background_sources, label('背景材料', 'Background sources')],
    [online.pendingLeads ?? online.pending_leads ?? online.leads_to_verify, label('待核验线索', 'Leads to verify')],
  ] as const) {
    for (const item of items(group)) reference(item, context);
  }

  const detailFields = [
    ['judgmentType', 'Judgment type', ['judgmentType', 'judgment_type'], formatJudgmentType],
    ['evidenceGrade', 'Evidence grade', ['evidenceGrade', 'evidence_grade', 'currentEvidenceGrade', 'current_evidence_grade']],
    ['verificationStatus', 'Verification status', ['verificationStatus', 'verification_status'], formatVerificationStatus],
    ['speculationRisk', 'Speculation uncertainty', ['speculationRisk', 'speculation_risk']],
    ['limitation', 'Limitation', ['limitation']],
    ['whyItMatters', 'Why it matters', ['whyItMatters', 'why_it_matters', 'why_needed']],
    ['nextVerification', 'Next verification', ['nextVerification', 'next_verification', 'pendingVerification', 'verificationPath', 'verification_path', 'verification_method']],
    ['possibleBenefit', 'Potential benefit', ['possibleBenefit', 'possible_benefit']],
    ['possibleCost', 'Potential cost', ['possibleCost', 'possible_cost']],
    ['currentEvidenceStatus', 'Current evidence', ['currentEvidenceStatus', 'current_evidence']],
    ['neededVerification', 'Required verification', ['neededVerification', 'needed_verification']],
    ['materialType', 'Material type', ['materialType', 'material_type'], formatMaterialType],
    ['priority', 'Priority', ['priority']],
    ['source', 'Source', ['source', 'provider']],
  ] as const;

  function entry(item: ReportItem): ExportEntry {
    const heading = field(item, 'title', 'supportsNarrative', 'supports_narrative', 'role', 'actor', 'question', 'target', 'explanation', 'perspective', 'claim');
    const body = field(item, 'content', 'detail', 'description', 'reason', 'snippet', 'missing_information', 'original_basis', 'possible_interest_or_cost');
    const notes = new Set([heading, body]);
    const detail = detailFields.flatMap(([key, en, keys, format]) => {
      const value = field(item, ...keys);
      if (!value || notes.has(value)) return [];
      notes.add(value);
      return [`${exportFieldLabel(language, key, en)}: ${format ? format(value, language) : exportLocalizedValue(language, value)}`];
    }).join(' · ');
    const directReference = reference(item);
    return { heading, body: body === heading ? '' : body, detail, links: directReference ? [directReference] : [] };
  }

  const sections: ExportSection[] = [];
  const add = (title: string, entries: ExportEntry[]) => {
    const content = entries.filter(item => item.heading || item.body || item.detail || item.links?.length);
    if (content.length) sections.push({ title, entries: content });
  };
  const prose = (value: unknown): ExportEntry => ({ body: text(value) });
  const group = (heading: string, value: unknown): ExportEntry => {
    const entries = Array.isArray(value) ? value.map(formatUnconfirmedItem).filter(Boolean) : [];
    return { heading: entries.length ? heading : '', body: entries.map(item => `• ${item}`).join('\n') };
  };
  const titled = (heading: string, value: unknown): ExportEntry => ({ heading: text(value) ? heading : '', body: text(value) });

  const summary = text(audit.newsSummary) || field(report, 'newsSummary', 'news_summary') || field(source, 'whatItSays', 'what_it_says');
  const conclusion = field(report, 'oneSentenceConclusion', 'one_sentence_conclusion', 'oneSentenceJudgment', 'quickConclusion');
  const interpretation = field(source, 'whatItSays', 'what_it_says') || field(report, 'originalReading');
  const readingValue = exportLocalizedValue(language, field(report, 'readingValue', 'reading_value'));
  const readingReason = field(report, 'readingValueReason', 'reading_value_reason');
  const readingGuide = field(report, 'normalReaderGuide', 'normal_reader_guide');
  const commonBasis = [...findings, ...evidence].map(item => field(item, 'content', 'detail', 'description', 'limitation')).find(body =>
    /(?:均|都)\s*(?:引用|援引|转引)|\ball (?:cite|citing|cited|quoting|quote|quoted|rely on)\b/i.test(body),
  );

  add(label('新闻事件与原始主张', 'News event and original claims'), [
    prose(interpretation === summary ? '' : interpretation),
    titled(reportText('coreClaims'), report.coreClaim),
    group(reportText('coreClaims'), source.coreClaims ?? source.core_claims ?? items(mirror.atomic_claims).map(item => item.claim)),
    group(reportText('mainActors'), source.mainActors ?? source.main_actors),
    group(reportText('keyEvidence'), source.keyEvidence ?? source.key_evidence),
    titled(reportText('narrativeStyle'), field(source, 'narrativeStyle', 'narrative_style') || field(framing, 'problem_definition')),
    titled(reportText('readerImpression'), field(source, 'likelyReaderImpression', 'likely_reader_impression') || field(framing, 'implied_solution')),
  ]);
  add(label('阅读价值', 'Reading value'), [{ heading: readingValue, body: readingReason }, prose(readingGuide)]);
  add(label('结论分层', 'Layers of conclusion'), [
    group(reportText('confirmed'), layers.confirmed),
    group(reportText('reasonableDoubts'), layers.reasonableDoubts ?? layers.reasonable_doubts),
    group(reportText('cannotJudge'), layers.cannotJudgeYet ?? layers.cannot_judge_yet),
  ]);
  const signals = record(report.quickSignals);
  add(label('关键发现', 'Key findings'), [
    titled(label('最可信信息', 'Most credible information'), signals.mostCredibleInfo),
    titled(label('最大信息缺口', 'Largest information gap'), signals.biggestGap),
    titled(label('最需警惕的叙事', 'Narrative to watch'), signals.narrativeToWatch),
    ...findings.map(entry),
  ]);
  add(label('证据评估', 'Evidence assessment'), [
    ...evidence.map(entry),
    titled(reportText('strongestEvidence'), verification.strongestEvidence ?? verification.strongest_evidence),
    titled(reportText('weakestEvidence'), verification.weakestEvidence ?? verification.weakest_evidence),
    group(reportText('sourceSupported'), verification.sourceSupportedClaims ?? verification.source_supported_claims),
    group(reportText('externallyVerified'), verification.externallyVerifiedClaims ?? verification.externally_verified_claims),
    group(reportText('pendingExternalVerification'), verification.pendingVerificationClaims ?? verification.pending_verification_claims),
    group(reportText('unableToVerify'), verification.unableToVerifyClaims ?? verification.unable_to_verify_claims ?? online.unableToConfirm ?? online.unconfirmed_items),
  ]);
  add(label('主要信息缺口', 'Major information gaps'), gaps.map(entry));
  add(label('关键利益关系', 'Key interest relationships'), items(report.stakeholderRelations ?? report.interestRelationships ?? mirror.interest_cost_map).map(entry));
  add(label('替代解释', 'Alternative explanations'), items(report.alternativeExplanations ?? report.alternative_explanations ?? mirror.alternative_explanation_comparison).map(entry));
  add(label('风险与不确定性', 'Risk and uncertainty'), [
    prose(report.quickConclusion === conclusion ? '' : report.quickConclusion),
    prose(report.riskNotice ?? report.risk_notice), group(reportText('cannotJudge'), report.cannotConclude ?? report.cannot_conclude),
  ]);
  const checked = new Map(items(report.manualVerifications).map(item => [item.index, item]));
  add(label('验证路线图', 'Verification roadmap'), items(report.verificationRoadmap ?? report.verification_roadmap ?? mirror.verification_roadmap).map((task, index) => {
    const item = entry(task);
    const verification = checked.get(index);
    const outcome = verification?.question === task.question ? verification?.outcome : null;
    if (outcome === 'verified' || outcome === 'unverified') {
      const note = outcome === 'verified'
        ? label('用户标记：找到可核验材料', 'Reader marked checkable material found')
        : label('用户标记：暂未找到可核验材料', 'Reader marked no checkable material found');
      item.detail = [item.detail, note].filter(Boolean).join(' · ');
    }
    return item;
  }));
  const completedDraft = audit.completionMarkdown || report.completionMarkdown;
  const article = readCompletionArticle(completedDraft);
  if (article) {
    add(label('AI 改写新闻稿', 'AI-rewritten article'), [{ heading: article.title, body: article.paragraphs.join('\n\n') }]);
  } else {
    add(label('AI 补充分析', 'AI supplementary analysis'), [prose(completedDraft)]);
  }
  const followups = (options.followups ?? []).filter(turn => !hasToolCallMarkup(turn.answer));
  add(label('已完成追问', 'Completed follow-ups'), followups.map((turn, index): ExportEntry => ({
    heading: `${index + 1}. ${text(turn.question)}`,
    body: text(turn.answer),
    detail: turn.createdAt ? dateLabel(turn.createdAt.toISOString(), language) : undefined,
    links: items(turn.sources).flatMap(item => {
      const context = item.kind === 'snippet' ? label('仅检索摘要', 'Search snippet') : '';
      const link = reference(item, context);
      return link ? [link] : [];
    }),
  })));
  add(label('建议继续追问', 'Questions to ask next'), items(report.questionsToAsk ?? report.questions_to_ask_next).map(entry));

  const metadata = [
    getExportBrand(language).name,
    `v${audit.reportVersion}`,
    dateLabel(audit.createdAt.toISOString(), language),
    text(audit.modelName),
    field(report, 'methodology'),
  ].filter(Boolean).join(' · ');
  const publisher = [text(audit.source), dateLabel(text(audit.publishedAt), language)].filter(Boolean).join(' · ');
  const originalLink = url(record(report.meta).sourceUrl ?? record(report.meta).source_url ?? report.sourceUrl ?? report.source_url);
  const appendix = options.includeOriginal ? cleanAppendix(audit.originalContent, language) : '';

  return {
    title: audit.title,
    subtitle: label('新闻叙事审视报告', 'News Narrative Review Report'),
    contentsTitle: label('目录', 'Table of contents'),
    summaryTitle: label('摘要', 'Abstract'),
    language,
    emphasisPhrases: normalizeEmphasisPhrases(report.emphasisPhrases),
    publisher,
    original: originalLink ? { label: label('查看新闻原文', 'Read the original article'), href: originalLink } : undefined,
    summary,
    conclusion,
    conclusionLabel: label('核心结论', 'Core conclusion'),
    evidenceNote: commonBasis ? label(
      '报告注明多家媒体引用同一材料。转述应追溯至共同出处，官方认证需有相应文件。',
      'The report notes that multiple outlets cite the same material. Trace those accounts to their shared source and look for separate documentation of any official certification.',
    ) : '',
    metrics,
    metricsTitle: label('核心指标与评分理由', 'Core metrics and rationale'),
    metricsNote: field(report, 'scoreExplanation') || label('评分衡量报道结构与证据状态。', 'Scores describe the reporting and its evidence.'),
    grades: gradeCounts.some(grade => grade.value) ? gradeCounts : [],
    gradesTitle: label('证据等级分布', 'Evidence grade distribution'),
    gradesNote: label('统计关键发现、支持证据和信息缺口中标注等级的条目。', 'Counts graded findings, supporting evidence, and information gaps.'),
    columns: { metric: label('指标', 'Metric'), score: label('分数', 'Score'), rationale: label('评分理由', 'Rationale'), grade: label('等级', 'Grade'), count: label('条数', 'Count') },
    sections,
    references: { title: label('参考来源', 'References'), entries: [...references.values()] },
    appendix: appendix ? { title: label('附录：新闻原文', 'Appendix: original article'), entries: [{ body: appendix, verbatim: true }] } : null,
    metadata,
    disclaimer: exportDisclaimer(language, true),
    createdAt: audit.createdAt,
  };
}

export type ReportExport = ReturnType<typeof buildReportExport>;

export function buildReportOutline(report: ReportExport) {
  const sections: Array<ExportSection & { kind: 'text' | 'metrics' | 'grades' | 'references' | 'appendix' }> = [
    { kind: 'text', title: report.summaryTitle, entries: report.summary ? [{ body: report.summary }] : [] },
    { kind: 'text', title: report.conclusionLabel, entries: report.conclusion ? [{ body: report.conclusion, detail: report.evidenceNote }] : [] },
    { kind: 'metrics', title: report.metricsTitle, entries: [] },
    { kind: 'grades', title: report.gradesTitle, entries: [] },
    ...report.sections.map(section => ({ ...section, kind: 'text' as const })),
    { ...report.references, kind: 'references' },
    ...(report.appendix ? [{ ...report.appendix, kind: 'appendix' as const }] : []),
  ];
  return sections.filter(section => section.kind === 'metrics' ? report.metrics.length : section.kind === 'grades' ? report.grades.length : section.entries.length)
    .map((section, index) => {
      const number = index + 1;
      let subheading = 0;
      return {
        ...section,
        id: `section_${number}`,
        title: `${number}. ${section.title}`,
        entries: section.entries.map(entry => ({
          ...entry,
          heading: entry.heading && section.kind !== 'references'
            ? `${number}.${++subheading} ${entry.heading.replaceAll('\n', ' ')}`
            : entry.heading,
        })),
      };
    });
}

export function renderMarkdownExport(report: ReportExport) {
  const markdownLink = (link: ExportLink) => `[${link.label}](<${link.href}>)`;
  const tableCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
  const { columns } = report;
  const sections = buildReportOutline(report);
  const body = [
    `# ${report.title}`,
    [report.publisher, report.original && markdownLink(report.original)].filter(Boolean).join(' · '),
    ...sections.filter(section => section.kind !== 'appendix').map(section => {
      const heading = `## ${section.title}`;
      if (section.kind === 'metrics') return [
        heading + '\n',
        `| ${columns.metric} | ${columns.score} | ${columns.rationale} |`,
        '| --- | ---: | --- |',
        ...report.metrics.map(metric => `| ${metric.label} | ${metric.value}/100 | ${tableCell(emphasizeReportTextMarkdown(metric.reason, report.emphasisPhrases))} |`),
        `\n${report.metricsNote}`,
      ].join('\n');
      if (section.kind === 'grades') return [
        heading + '\n',
        `| ${columns.grade} | ${columns.count} |`,
        '| --- | ---: |',
        ...report.grades.map(grade => `| ${grade.label} | ${grade.value} |`),
        `\n${report.gradesNote}`,
      ].join('\n');
      if (section.kind === 'references') return [
        heading + '\n',
        ...section.entries.map(item => {
          const source = item.links?.[0];
          if (!source) return '';
          const label = `${source.label} · ${item.heading || source.label}`.replaceAll('[', '\\[').replaceAll(']', '\\]');
          return `- ${markdownLink({ ...source, label })}${item.detail ? ` · ${item.detail}` : ''}`;
        }),
      ].join('\n');
      return [
        heading,
        ...section.entries.map(entry => [
          entry.heading && `### ${entry.heading}`,
          entry.verbatim ? entry.body : entry.body && emphasizeReportMarkdown(entry.body, report.emphasisPhrases),
          [entry.detail, ...(entry.links ?? []).map(markdownLink)].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n\n')),
      ].join('\n\n');
    }),
    report.metadata,
    report.disclaimer,
  ].filter(Boolean).join('\n\n');
  const appendix = sections.find(section => section.kind === 'appendix');
  return appendix ? `${body}\n\n## ${appendix.title}\n\n${appendix.entries[0].body}` : body;
}

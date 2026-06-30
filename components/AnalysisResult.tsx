'use client';

import React, { useMemo, useState } from 'react';
import {
  AnalysisResult,
  DeepAnalysisResult,
  EvidenceGrade,
  QuickAnalysisResult,
  ReadWorthLabel,
  SpeculationRisk,
  VerificationStatus,
  VerificationStatusCode,
} from '../lib/types';
import AuditCharts from './AuditCharts';
import { GsapReveal } from './GsapMotion';
import InteractiveQA, { ChatMessage } from './InteractiveQA';
import ReadWorthVerdict from './ReadWorthVerdict';
import { computeReadWorth } from '../lib/readWorth';

interface AnalysisResultProps {
  result: AnalysisResult;
  auditId?: string;
  originalContent?: string;
  auditMeta?: {
    title?: string;
    source?: string;
    publishedAt?: string;
    publishedAtSource?: string;
    publishedAtConfidence?: string;
    modelName?: string;
    reasoningDepth?: string;
    analysisMode?: string;
    createdAt?: string;
    viewCount?: number;
    isPublic?: boolean;
  };
}

const STATUS_LABELS: Record<VerificationStatusCode, string> = {
  source_supported: '原文支持',
  externally_verified: '外部已核验',
  partially_supported: '部分支持',
  pending_verification: '待核验',
  unable_to_verify: '暂无法确认',
};

const SOURCE_LABELS: Record<string, string> = {
  user_input: '用户填写',
  json_ld: 'JSON-LD',
  meta_article: 'article meta',
  meta_og: 'OG meta',
  meta_pubdate: 'pubdate meta',
  time_tag: 'time 标签',
  body_people_daily_format: '正文人民日报版面日期',
  body_regex: '正文日期匹配',
  unknown: '未知',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
  unknown: '未知',
};

const EVIDENCE_DEFINITIONS: Record<EvidenceGrade, string> = {
  A: '原始文件、官方数据、法院文书、财报、政策原文',
  B: '多方独立报道、公开数据库、专业机构报告',
  C: '单一媒体报道、机构通稿、当事方说法',
  D: '基于原文缺口的合理推断',
  E: '高推测、缺乏直接证据、仅作为待验证假设',
};

function isQuick(result: AnalysisResult): result is QuickAnalysisResult {
  return (result as any).reportType === 'quick';
}

function isDeep(result: AnalysisResult): result is DeepAnalysisResult {
  return (result as any).reportType === 'deep';
}

function normalizeDisplayCopy<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/审计/g, '审视').replace(/审查/g, '审视') as T;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeDisplayCopy(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDisplayCopy(item)])) as T;
  }
  return value;
}

function normalizeStatus(value?: VerificationStatus | string): VerificationStatusCode {
  if (value === 'externally_verified' || value === 'source_supported' || value === 'partially_supported' || value === 'pending_verification' || value === 'unable_to_verify') return value;
  if (value === '已核验' || value === '原文支持') return 'source_supported';
  if (value === '部分核验') return 'partially_supported';
  if (value === '暂无法确认') return 'unable_to_verify';
  return 'pending_verification';
}

function evidenceClass(grade?: string) {
  switch (grade) {
    case 'A': return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300';
    case 'B': return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/30 dark:bg-cyan-950/20 dark:text-cyan-300';
    case 'C': return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300';
    case 'D': return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-300';
    case 'E': return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300';
    default: return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300';
  }
}

function riskClass(risk?: SpeculationRisk | string) {
  if (risk === '低') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300';
  if (risk === '高') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300';
}

function statusClass(status?: VerificationStatus | string) {
  const normalized = normalizeStatus(status);
  if (normalized === 'externally_verified') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300';
  if (normalized === 'source_supported') return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300';
  if (normalized === 'partially_supported') return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/30 dark:bg-cyan-950/20 dark:text-cyan-300';
  if (normalized === 'unable_to_verify') return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300';
  return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-300';
}

function Badge({ children, className, title }: { children: React.ReactNode; className: string; title?: string }) {
  return <span title={title} className={`inline-flex rounded border px-2 py-0.5 text-xxs font-bold ${className}`}>{children}</span>;
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section data-gsap-reveal className="result-card rounded-xl border border-gray-150 bg-white p-3 shadow-sm dark:border-gray-900 dark:bg-gray-950 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 border-b border-gray-100 pb-2 dark:border-gray-900 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-black text-gray-950 dark:text-white">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function line(value: unknown, fallback = '当前材料不足，无法形成可靠判断') {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text && text !== '未提供' && text !== '暂无' ? text : fallback;
}

function statusLabel(value?: VerificationStatus | string) {
  return STATUS_LABELS[normalizeStatus(value)];
}

function JudgmentCard({ item }: { item: any }) {
  const evidence = item.evidenceGrade || item.currentEvidenceGrade || item.evidence_grade || 'D';
  const status = item.verificationStatus || item.verification_status;
  const risk = item.speculationRisk || item.speculation_risk;
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
      <div className="font-bold leading-relaxed text-gray-950 dark:text-white">{line(item.title, '关键判断')}</div>
      <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{line(item.content || item.description || item.detail)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.judgmentType && (
          <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">{item.judgmentType}</Badge>
        )}
        <Badge className={evidenceClass(evidence)} title={EVIDENCE_DEFINITIONS[evidence as EvidenceGrade]}>
          证据 {evidence}
        </Badge>
        <Badge className={statusClass(status)}>{statusLabel(status)}</Badge>
        {risk && <Badge className={riskClass(risk)}>风险 {risk}</Badge>}
      </div>
      {(item.nextVerification || item.whyItMatters) && (
        <p className="mt-2 text-xxs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
          {item.whyItMatters ? `重要性：${item.whyItMatters}；` : ''}验证路径：{line(item.nextVerification, '寻找原始材料、公开数据、多方报道或当事方回应。')}
        </p>
      )}
    </article>
  );
}

function convertLegacyResult(result: any, auditMeta?: AnalysisResultProps['auditMeta']): DeepAnalysisResult {
  const scoreSummary = result.score_summary || {};
  const scores = {
    credibility: Number(scoreSummary.credibility_score ?? 70),
    informationCompleteness: Number(scoreSummary.information_completeness_score ?? 60),
    narrativeBias: Number(scoreSummary.narrative_bias_score ?? 45),
    evidenceStrength: Number(scoreSummary.evidence_strength_score ?? 60),
    speculationRisk: Number(scoreSummary.speculation_risk_score ?? 45),
  };
  return {
    reportType: 'deep',
    methodology: '观隅九镜审读法',
    meta: {
      title: auditMeta?.title || '',
      source: auditMeta?.source || '',
      publishedAt: auditMeta?.publishedAt || '',
      publishedAtSource: (auditMeta?.publishedAtSource as any) || 'unknown',
      publishedAtConfidence: (auditMeta?.publishedAtConfidence as any) || 'unknown',
      modelName: auditMeta?.modelName || '',
      reasoningDepth: auditMeta?.reasoningDepth || '',
      analysisMode: 'deep',
      createdAt: auditMeta?.createdAt || '',
      viewCount: auditMeta?.viewCount,
      isPublic: auditMeta?.isPublic,
    },
    generationScope: result.report_meta?.generated_scope || '历史记录兼容展示；新报告不再展开九镜方法步骤。',
    scoreExplanation: result.report_meta?.scoring_note || '评分用于衡量报道结构与证据状态，不等同于判断新闻真假。',
    newsSummary: result.news_summary || '',
    oneSentenceConclusion: result.one_sentence_conclusion || '',
    readingValue: (result.read_worth?.label || '暂无法判断') as ReadWorthLabel,
    read_worth: result.read_worth,
    scores,
    scoreReasons: {
      credibility: scoreSummary.score_reasoning?.credibility_score || '',
      informationCompleteness: scoreSummary.score_reasoning?.information_completeness_score || '',
      narrativeBias: scoreSummary.score_reasoning?.narrative_bias_score || '',
      evidenceStrength: scoreSummary.score_reasoning?.evidence_strength_score || '',
      speculationRisk: scoreSummary.score_reasoning?.speculation_risk_score || '',
    },
    keyFindings: (result.key_findings || []).slice(0, 3).map((item: any) => ({
      title: item.title,
      content: item.detail,
      judgmentType: item.judgment_type || '基于原文的合理推断',
      evidenceGrade: item.evidence_grade || 'D',
      verificationStatus: normalizeStatus(item.verification_status),
      speculationRisk: item.speculation_risk || '中',
      nextVerification: item.verification_method || '',
    })),
    supportingEvidence: (result.narrative_supporting_evidence || []).map((item: any) => ({
      content: item.detail,
      supportsNarrative: item.original_basis,
      evidenceGrade: item.evidence_grade || 'C',
      verificationStatus: normalizeStatus(item.verification_status),
      limitation: item.verification_method || '',
    })),
    informationGaps: (result.major_information_gaps || []).map((item: any) => ({
      title: item.title,
      description: item.detail,
      whyItMatters: item.why_it_matters,
      currentEvidenceGrade: item.evidence_grade || 'D',
      verificationStatus: normalizeStatus(item.verification_status),
      nextVerification: item.verification_method || '',
    })),
    stakeholderRelations: (result.nine_mirror_review?.interest_cost_map || []).map((item: any) => ({
      role: item.actor || item.role,
      possibleBenefit: item.role === '受益者' ? item.possible_interest_or_cost : '',
      possibleCost: item.role === '成本承担者' ? item.possible_interest_or_cost : '',
      judgmentType: item.judgment_type || '基于原文的合理推断',
      speculationRisk: item.speculation_risk || '中',
      pendingVerification: item.verification_method || '',
    })),
    alternativeExplanations: (result.nine_mirror_review?.alternative_explanation_comparison || []).slice(0, 4).map((item: any) => ({
      explanation: item.explanation,
      reasonableness: item.reasonableness || '中',
      currentEvidenceStatus: item.evidence_strength || '证据有限',
      speculationRisk: item.speculation_risk || '中',
      neededVerification: item.verification_method || '',
    })),
    evidenceVerificationSummary: {
      strongestEvidence: '历史记录未单独保存该归纳。',
      weakestEvidence: '历史记录未单独保存该归纳。',
      sourceSupportedClaims: [],
      externallyVerifiedClaims: [],
      pendingVerificationClaims: [],
      unableToVerifyClaims: result.web_verification?.unconfirmed_items || [],
    },
    verificationRoadmap: (result.nine_mirror_review?.verification_roadmap || []).slice(0, 6).map((item: any) => ({
      question: item.target,
      materialType: item.material_type || '多源报道',
      whyItMatters: item.why_needed,
      priority: item.priority || '中',
    })),
    questionsToAsk: result.questions_to_ask_next || [],
    onlineVerification: {
      enabled: Boolean(result.web_verification),
      status: result.web_verification ? 'has_results' : 'not_enabled',
      verifiedSources: (result.web_verification?.verified_sources || []).map((item: any) => ({
        title: item.title,
        url: item.url,
        sourceType: item.source_type,
        relevance: item.relevance,
        verificationStatus: normalizeStatus(item.verification_status),
        evidenceGrade: item.evidence_grade || 'C',
        note: item.note,
      })),
      backgroundSources: (result.web_verification?.background_sources || []).map((item: any) => ({
        title: item.title,
        url: item.url,
        sourceType: item.source_type,
        relevance: item.relevance,
        verificationStatus: normalizeStatus(item.verification_status),
        evidenceGrade: item.evidence_grade || 'C',
        note: item.note,
      })),
      pendingLeads: (result.web_verification?.leads_to_verify || []).map((item: any) => ({
        title: item.title,
        url: item.url,
        sourceType: item.source_type,
        relevance: item.relevance,
        verificationStatus: normalizeStatus(item.verification_status),
        evidenceGrade: item.evidence_grade || 'D',
        note: item.note,
      })),
      unableToConfirm: result.web_verification?.unconfirmed_items || [],
    },
    riskNotice: '本报告不替用户断言新闻真假，只帮助识别叙事结构、证据缺口、缺席视角和待验证问题。',
  };
}

function useNormalizedResult(result: AnalysisResult, auditMeta?: AnalysisResultProps['auditMeta']) {
  return useMemo(() => {
    const clean = normalizeDisplayCopy(result);
    if (isQuick(clean) || isDeep(clean)) return clean;
    return convertLegacyResult(clean, auditMeta);
  }, [result, auditMeta]);
}

function chartProps(report: QuickAnalysisResult | DeepAnalysisResult) {
  const evidenceGrades: EvidenceGrade[] = [];
  if (isQuick(report)) {
    report.mainNarrativeIssues.forEach((item) => evidenceGrades.push(item.evidenceGrade));
    report.mainInformationGaps.forEach((item) => evidenceGrades.push(item.currentEvidenceGrade));
  } else {
    report.keyFindings.forEach((item) => evidenceGrades.push(item.evidenceGrade));
    report.supportingEvidence.forEach((item) => evidenceGrades.push(item.evidenceGrade));
    report.informationGaps.forEach((item) => evidenceGrades.push(item.currentEvidenceGrade));
  }

  const stakeholderItems = isDeep(report)
    ? report.stakeholderRelations.map((item) => ({
        actor: item.role,
        role: item.possibleBenefit ? '受益者' as const : item.possibleCost ? '成本承担者' as const : '沉默者' as const,
        possible_interest_or_cost: item.possibleBenefit || item.possibleCost || item.pendingVerification,
        evidence_strength: 'D' as EvidenceGrade,
        speculation_risk: item.speculationRisk,
        verification_method: item.pendingVerification,
      }))
    : [];

  return {
    credibilityScore: report.scores.credibility,
    completenessScore: report.scores.informationCompleteness,
    biasScore: report.scores.narrativeBias,
    evidenceScore: report.scores.evidenceStrength,
    riskScore: report.scores.speculationRisk,
    beneficiariesCount: isDeep(report) ? report.stakeholderRelations.filter((item) => item.possibleBenefit).length : 0,
    costBearersCount: isDeep(report) ? report.stakeholderRelations.filter((item) => item.possibleCost).length : 0,
    missingPerspectivesCount: isQuick(report) ? report.mainInformationGaps.length : report.informationGaps.length,
    alternativeExplanationsCount: isDeep(report) ? report.alternativeExplanations.length : 0,
    evidenceGrades,
    missingPerspectiveStatuses: [],
    interestCostItems: stakeholderItems,
  };
}

function MetaGrid({ report, auditMeta }: { report: QuickAnalysisResult | DeepAnalysisResult; auditMeta?: AnalysisResultProps['auditMeta'] }) {
  const meta = report.meta;
  const publishedAt = meta.publishedAt || auditMeta?.publishedAt || '';
  const source = meta.publishedAtSource || auditMeta?.publishedAtSource || 'unknown';
  const confidence = meta.publishedAtConfidence || auditMeta?.publishedAtConfidence || 'unknown';
  const items = [
    ['新闻标题', meta.title || auditMeta?.title],
    ['新闻来源', meta.source || auditMeta?.source],
    ['发布时间', publishedAt || '未能可靠识别发布时间'],
    ['时间来源', SOURCE_LABELS[source] || source],
    ['时间可信度', CONFIDENCE_LABELS[confidence] || confidence],
    ['使用模型', meta.modelName || auditMeta?.modelName],
    ['思考强度', meta.reasoningDepth || auditMeta?.reasoningDepth],
    ['分析模式', meta.analysisMode || auditMeta?.analysisMode],
    ['报告生成时间', meta.createdAt || auditMeta?.createdAt],
    ['点击数', meta.viewCount ?? auditMeta?.viewCount],
    ['公开状态', (meta.isPublic ?? auditMeta?.isPublic) === undefined ? undefined : (meta.isPublic ?? auditMeta?.isPublic) ? '公开展示' : '仅自己可见'],
    ['方法论', report.methodology],
  ];

  return (
    <Section title="报告元信息" aside={<Badge className="border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">阅读价值：{report.readingValue}</Badge>}>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-850 dark:bg-gray-900">
            <div className="text-xxs font-bold text-gray-400">{label}</div>
            <div className="mt-1 break-words font-semibold text-gray-800 dark:text-gray-200">{line(value, label === '发布时间' ? '未能可靠识别发布时间' : '未填写')}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function OriginalContentPanel({ originalContent }: { originalContent?: string }) {
  const [open, setOpen] = useState(false);
  if (!originalContent?.trim()) return null;
  return (
    <Section title="新闻原文" aside={<button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 active:scale-[0.98] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">{open ? '收起原文' : '查看原文'}</button>}>
      {!open ? (
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">完整原文默认折叠，只在需要核对模型引用和上下文时展开。</p>
      ) : (
        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs leading-6 text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{originalContent}</pre>
      )}
    </Section>
  );
}

function WebVerificationView({ report }: { report: DeepAnalysisResult }) {
  const web = report.onlineVerification;
  if (!web.enabled || web.status === 'not_enabled') {
    return <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">本次未启用联网核验</p>;
  }
  if (web.status === 'no_reliable_sources') {
    return <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">未找到可用于外部核验的可靠来源</p>;
  }

  const groups = [
    ['已核验来源', web.verifiedSources],
    ['相关背景来源', web.backgroundSources],
    ['待核验线索', web.pendingLeads],
  ] as const;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {groups.map(([title, items]) => (
          <div key={title} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
            <h4 className="text-xs font-black text-gray-900 dark:text-white">{title}</h4>
            <div className="mt-2 space-y-2">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400">当前无可靠条目。</p>
              ) : items.slice(0, 4).map((source, index) => (
                <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-100 bg-white p-2 text-xs transition hover:border-sky-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-sky-800">
                  <div className="line-clamp-2 font-bold text-gray-950 dark:text-white">{line(source.title, '来源标题')}</div>
                  <p className="mt-1 line-clamp-2 text-gray-500 dark:text-gray-400">{source.relevance || source.note}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge className={statusClass(source.verificationStatus)}>{statusLabel(source.verificationStatus)}</Badge>
                    <Badge className={evidenceClass(source.evidenceGrade)}>证据 {source.evidenceGrade}</Badge>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      {web.unableToConfirm.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
          <h4 className="text-xs font-black text-gray-900 dark:text-white">暂无法确认的信息</h4>
          <ul className="mt-2 space-y-1.5">
            {web.unableToConfirm.map((item, index) => <li key={`${item}-${index}`} className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">- {item}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function bullets(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ['- 当前材料不足，无法形成可靠判断'];
}

function markdownFor(report: QuickAnalysisResult | DeepAnalysisResult, originalContent?: string, qaMessages: ChatMessage[] = []) {
  const meta = report.meta;
  const common = [
    '# 观隅 · 新闻叙事审视报告',
    '',
    '## 报告元信息',
    `- 新闻标题：${line(meta.title, '未填写')}`,
    `- 新闻来源：${line(meta.source, '未填写')}`,
    `- 新闻发布时间：${meta.publishedAt || '未能可靠识别发布时间'}`,
    `- 发布时间来源：${SOURCE_LABELS[meta.publishedAtSource] || meta.publishedAtSource}`,
    `- 发布时间可信度：${CONFIDENCE_LABELS[meta.publishedAtConfidence] || meta.publishedAtConfidence}`,
    `- 使用模型：${line(meta.modelName, '未填写')}`,
    `- 思考强度：${line(meta.reasoningDepth, '未填写')}`,
    `- 分析模式：${line(meta.analysisMode, '未填写')}`,
    `- 报告生成时间：${line(meta.createdAt, '未填写')}`,
    `- 方法论：${report.methodology}`,
    `- 阅读价值判断：${report.readingValue}`,
    '',
    '## 新闻简要总结',
    report.newsSummary,
    '',
  ];

  const scoreLines = [
    '## 核心指数',
    `- 可信度：${report.scores.credibility}`,
    `- 信息完整度：${report.scores.informationCompleteness}`,
    `- 叙事倾向性：${report.scores.narrativeBias}`,
    `- 证据强度：${report.scores.evidenceStrength}`,
    `- 推测风险：${report.scores.speculationRisk}`,
    '',
  ];

  if (isQuick(report)) {
    return [
      ...common,
      '## 一句话判断',
      report.oneSentenceJudgment,
      '',
      ...scoreLines,
      '## 最主要的 3 个叙事问题',
      ...report.mainNarrativeIssues.map((item) => `- **${item.title}**：${item.content}（${item.judgmentType}，证据 ${item.evidenceGrade}，${statusLabel(item.verificationStatus)}，风险 ${item.speculationRisk}；验证：${item.nextVerification}）`),
      '',
      '## 最主要的 3 个信息缺口',
      ...report.mainInformationGaps.map((item) => `- **${item.title}**：${item.description}（证据 ${item.currentEvidenceGrade}，${statusLabel(item.verificationStatus)}；验证：${item.nextVerification}）`),
      '',
      '## 最值得追问的 3 个问题',
      ...bullets(report.questionsToAsk),
      '',
      '## 交互式追问记录',
      ...(qaMessages.length ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? '我的问题' : '审视助手回答'}\n\n${message.content}`) : ['暂无交互式追问记录。']),
      '',
      '## 附录：新闻原文',
      originalContent?.trim() || '未保存原文。',
      '',
      '## 风险提示',
      report.riskNotice,
    ].join('\n');
  }

  return [
    ...common,
    '## 一句话审视结论',
    report.oneSentenceConclusion,
    '',
    ...scoreLines,
    '## 评分理由',
    `- 可信度：${report.scoreReasons.credibility}`,
    `- 信息完整度：${report.scoreReasons.informationCompleteness}`,
    `- 叙事倾向性：${report.scoreReasons.narrativeBias}`,
    `- 证据强度：${report.scoreReasons.evidenceStrength}`,
    `- 推测风险：${report.scoreReasons.speculationRisk}`,
    '',
    '## 最关键的 3 个发现',
    ...report.keyFindings.map((item) => `- **${item.title}**：${item.content}（${item.judgmentType}，证据 ${item.evidenceGrade}，${statusLabel(item.verificationStatus)}，风险 ${item.speculationRisk}；验证：${item.nextVerification}）`),
    '',
    '## 支持原文叙事的证据',
    ...report.supportingEvidence.map((item) => `- ${item.content}；支撑：${item.supportsNarrative}；证据 ${item.evidenceGrade}；${statusLabel(item.verificationStatus)}；局限：${item.limitation}`),
    '',
    '## 主要信息缺口',
    ...report.informationGaps.map((item) => `- **${item.title}**：${item.description}；重要性：${item.whyItMatters}；证据 ${item.currentEvidenceGrade}；${statusLabel(item.verificationStatus)}；验证：${item.nextVerification}`),
    '',
    '## 关键利益关系',
    ...report.stakeholderRelations.map((item) => `- **${item.role}**：可能利益：${item.possibleBenefit || '原文未披露，需核验'}；可能代价：${item.possibleCost || '原文未披露，需核验'}；${item.judgmentType}；风险 ${item.speculationRisk}；待验证：${item.pendingVerification}`),
    '',
    '## 替代解释对照',
    ...report.alternativeExplanations.map((item) => `- **${item.explanation}**：合理性 ${item.reasonableness}；当前证据：${item.currentEvidenceStatus}；风险 ${item.speculationRisk}；需验证：${item.neededVerification}`),
    '',
    '## 证据与核验状态',
    `- 最强证据：${report.evidenceVerificationSummary.strongestEvidence}`,
    `- 最弱证据：${report.evidenceVerificationSummary.weakestEvidence}`,
    ...bullets(report.evidenceVerificationSummary.sourceSupportedClaims.map((item) => `仅由原文支持：${item}`)),
    ...bullets(report.evidenceVerificationSummary.pendingVerificationClaims.map((item) => `待外部核验：${item}`)),
    '',
    '## 验证路线图',
    ...report.verificationRoadmap.map((item) => `- **${item.question}**：材料类型 ${item.materialType}；优先级 ${item.priority}；重要性：${item.whyItMatters}`),
    '',
    '## 继续追问清单',
    ...bullets(report.questionsToAsk),
    '',
    '## 交互式追问记录',
    ...(qaMessages.length ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? '我的问题' : '审视助手回答'}\n\n${message.content}`) : ['暂无交互式追问记录。']),
    '',
    '## 附录：新闻原文',
    originalContent?.trim() || '未保存原文。',
    '',
    '## 风险提示',
    report.riskNotice,
  ].join('\n');
}

function DownloadButton({ report, originalContent, qaMessages }: { report: QuickAnalysisResult | DeepAnalysisResult; originalContent?: string; qaMessages: ChatMessage[] }) {
  const download = () => {
    const blob = new Blob([markdownFor(report, originalContent, qaMessages)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'guanyu-review.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-gsap-reveal className="flex flex-wrap justify-end gap-2">
      <button onClick={download} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 active:scale-[0.98] dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300">
        导出完整 Markdown
      </button>
    </div>
  );
}

function QuickReportView({ report, originalContent, auditMeta, qaMessages }: { report: QuickAnalysisResult; originalContent?: string; auditMeta?: AnalysisResultProps['auditMeta']; qaMessages: ChatMessage[] }) {
  return (
    <>
      <MetaGrid report={report} auditMeta={auditMeta} />
      <Section title="新闻简要总结"><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.newsSummary}</p></Section>
      <Section title="一句话判断"><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.oneSentenceJudgment}</p></Section>
      <AuditCharts {...chartProps(report)} />
      <Section title="最主要的 3 个叙事问题">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">{report.mainNarrativeIssues.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}</div>
      </Section>
      <Section title="最主要的 3 个信息缺口">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">{report.mainInformationGaps.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}</div>
      </Section>
      <Section title="最值得追问的 3 个问题">
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">{report.questionsToAsk.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{item}</li>)}</ul>
      </Section>
      <OriginalContentPanel originalContent={originalContent} />
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} />
    </>
  );
}

function DeepReportView({ report, originalContent, auditMeta, qaMessages }: { report: DeepAnalysisResult; originalContent?: string; auditMeta?: AnalysisResultProps['auditMeta']; qaMessages: ChatMessage[] }) {
  return (
    <>
      <MetaGrid report={report} auditMeta={auditMeta} />
      <Section title="新闻简要总结"><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.newsSummary}</p></Section>
      <Section title="一句话审视结论"><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.oneSentenceConclusion}</p></Section>
      <AuditCharts {...chartProps(report)} />
      <Section title="最关键的 3 个发现"><div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{report.keyFindings.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}</div></Section>
      <Section title="支持原文叙事的证据" aside={<span className="text-xxs font-semibold text-gray-400">避免只唱反调</span>}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{report.supportingEvidence.map((item, index) => <JudgmentCard key={`${item.content}-${index}`} item={{ title: item.supportsNarrative, content: item.content, evidenceGrade: item.evidenceGrade, verificationStatus: item.verificationStatus, nextVerification: item.limitation }} />)}</div>
      </Section>
      <Section title="主要信息缺口"><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{report.informationGaps.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}</div></Section>
      <Section title="关键利益关系">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {report.stakeholderRelations.map((item, index) => <JudgmentCard key={`${item.role}-${index}`} item={{ title: item.role, content: `可能利益：${item.possibleBenefit || '原文未披露，需进一步核验。'}；可能代价：${item.possibleCost || '原文未披露，需进一步核验。'}`, judgmentType: item.judgmentType, speculationRisk: item.speculationRisk, nextVerification: item.pendingVerification, verificationStatus: 'pending_verification', evidenceGrade: 'D' }} />)}
        </div>
      </Section>
      <Section title="替代解释对照">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{report.alternativeExplanations.map((item, index) => <JudgmentCard key={`${item.explanation}-${index}`} item={{ title: item.explanation, content: `合理性：${item.reasonableness}；当前证据：${item.currentEvidenceStatus}`, speculationRisk: item.speculationRisk, nextVerification: item.neededVerification, verificationStatus: 'pending_verification', evidenceGrade: item.speculationRisk === '高' ? 'E' : 'D' }} />)}</div>
      </Section>
      <Section title="证据与核验状态">
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><span className="font-bold">最强证据：</span>{report.evidenceVerificationSummary.strongestEvidence}</div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><span className="font-bold">最弱证据：</span>{report.evidenceVerificationSummary.weakestEvidence}</div>
          {[
            ['仅由原文支持', report.evidenceVerificationSummary.sourceSupportedClaims],
            ['外部已核验', report.evidenceVerificationSummary.externallyVerifiedClaims],
            ['待外部核验', report.evidenceVerificationSummary.pendingVerificationClaims],
            ['暂无法确认', report.evidenceVerificationSummary.unableToVerifyClaims],
          ].map(([title, items]) => (
            <div key={String(title)} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
              <div className="font-black text-gray-900 dark:text-white">{String(title)}</div>
              <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">{(items as string[]).length ? (items as string[]).map((item, index) => <li key={`${item}-${index}`}>- {item}</li>) : <li>当前材料不足，无法形成可靠判断</li>}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section title="验证路线图">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{report.verificationRoadmap.map((item, index) => <article key={`${item.question}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900"><div className="font-bold text-gray-950 dark:text-white">{item.question}</div><p className="mt-1 text-gray-600 dark:text-gray-300">{item.whyItMatters}</p><div className="mt-2 flex gap-1.5"><Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">{item.materialType}</Badge><Badge className={riskClass(item.priority)}>优先级 {item.priority}</Badge></div></article>)}</div>
      </Section>
      <Section title="联网核验结果"><WebVerificationView report={report} /></Section>
      <Section title="继续追问清单"><ul className="grid grid-cols-1 gap-2 md:grid-cols-2">{report.questionsToAsk.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{item}</li>)}</ul></Section>
      <OriginalContentPanel originalContent={originalContent} />
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} />
    </>
  );
}

export default function AnalysisResultView({ result: rawResult, auditId, originalContent, auditMeta }: AnalysisResultProps) {
  const result = useNormalizedResult(rawResult, auditMeta);
  const [qaMessages, setQaMessages] = useState<ChatMessage[]>([]);
  const readWorth = result.read_worth || computeReadWorth(result);

  return (
    <GsapReveal className="space-y-4 sm:space-y-5" y={18} stagger={0.055}>
      <div data-gsap-reveal className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-850 dark:border-amber-900/30 dark:bg-amber-950/15 dark:text-amber-300">
        风险提示：本报告审视的是报道结构、证据状态和待核验问题，不直接判断新闻真假，也不把推测视为事实。
      </div>

      <div data-gsap-reveal>
        <ReadWorthVerdict label={readWorth.label} />
      </div>

      {isQuick(result)
        ? <QuickReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} auditMeta={auditMeta} qaMessages={qaMessages} />
        : <DeepReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} auditMeta={auditMeta} qaMessages={qaMessages} />}

      <Section title="风险提示">
        <div className="space-y-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          <p>{result.riskNotice}</p>
          <p>本报告基于观隅九镜审读法生成，但九镜只作为内部分析流程，不作为正文逐条展开。</p>
        </div>
      </Section>

      {auditId && <InteractiveQA auditId={auditId} messages={qaMessages} onMessagesChange={setQaMessages} />}
    </GsapReveal>
  );
}

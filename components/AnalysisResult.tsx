'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  AnalysisResult,
  DeepAnalysisResult,
  EvidenceGrade,
  QuickAnalysisResult,
  ReadWorthLabel,
  ManualVerificationRecord,
  ManualVerificationOutcome,
  getReportLanguageLabel,
  getReadWorthDisplayLabel,
  normalizeReportLanguage,
  SpeculationRisk,
  VerificationStatus,
  VerificationStatusCode,
} from '../lib/types';
import AuditCharts from './AuditCharts';
import GuanyuCardButton from './GuanyuCardButton';
import { GsapReveal } from './GsapMotion';
import InteractiveQA, { ChatMessage } from './InteractiveQA';
import DiscussionBoard from './DiscussionBoard';
import { useUiLanguage } from './LanguageProvider';
import ReadWorthVerdict from './ReadWorthVerdict';
import { PlatformModelSelector, type ModelSourceSelection } from './PlatformModelSelector';
import VerificationRoadmap from './VerificationRoadmap';
import { computeReadWorth } from '../lib/readWorth';
import {
  formatAnalysisMode,
  formatConfidence,
  formatEvidenceGrade,
  formatJudgmentType,
  formatMaterialType,
  formatPriority,
  formatPublishedAtSource,
  formatReasonableness,
  formatSpeculationRisk,
  formatThinkingDepth,
  formatUnconfirmedItem,
  formatVerificationStatus,
  getReportText,
} from '../lib/report-display-core.mjs';

gsap.registerPlugin(useGSAP);

interface AnalysisResultProps {
  result: AnalysisResult;
  auditId?: string;
  canUpdateVerification?: boolean;
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
    reportLanguage?: string;
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
  ai_assessed: '模型判断',
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

const EMPTY_ONLINE_TITLES = new Set(['相关背景来源', '待核验线索', '来源标题', '未提供', '暂无']);
const EMPTY_ONLINE_TEXT = new Set(['可作为背景核对方向。', '当前无可靠条目。', '未找到可用于外部核验的可靠来源。']);

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

function manualVerificationLabel(outcome: ManualVerificationOutcome, reportLanguage = 'zh-CN') {
  if (reportLanguage.startsWith('zh')) return outcome === 'verified' ? '已标记：找到可核验材料' : '已标记：暂未找到可核验材料';
  return outcome === 'verified' ? 'Marked: checkable material found' : 'Marked: no checkable material found';
}

function isUsefulOnlineSource(source: any) {
  const title = String(source?.title || '').trim();
  const url = String(source?.url || '').trim();
  const relevance = String(source?.relevance || source?.note || '').trim();
  if (!url && (!title || EMPTY_ONLINE_TITLES.has(title)) && (!relevance || EMPTY_ONLINE_TEXT.has(relevance))) return false;
  if (EMPTY_ONLINE_TITLES.has(title) && (!relevance || EMPTY_ONLINE_TEXT.has(relevance))) return false;
  return Boolean(url || title || relevance);
}

function safeHost(url: string, reportLanguage = 'zh-CN') {
  try {
    return new URL(url).hostname;
  } catch {
    return !reportLanguage.startsWith('zh-') ? 'Source' : '来源标题';
  }
}

function statusLabel(value?: VerificationStatus | string, reportLanguage = 'zh-CN') {
  return formatVerificationStatus(normalizeStatus(value), reportLanguage) || STATUS_LABELS[normalizeStatus(value)];
}

function JudgmentCard({ item, reportLanguage = 'zh-CN' }: { item: any; reportLanguage?: string }) {
  const evidence = item.evidenceGrade || item.currentEvidenceGrade || item.evidence_grade || 'D';
  const status = item.verificationStatus || item.verification_status;
  const risk = item.speculationRisk || item.speculation_risk;
  const text = (key: string) => getReportText(key, reportLanguage);
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
      <div className="text-sm font-black leading-snug text-gray-950 dark:text-white md:text-base">{line(item.title, !reportLanguage.startsWith('zh-') ? 'Key finding' : '关键判断')}</div>
      <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{line(item.content || item.description || item.detail, text('insufficientMaterial'))}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.judgmentType && (
          <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">{formatJudgmentType(item.judgmentType, reportLanguage)}</Badge>
        )}
        <Badge className={evidenceClass(evidence)} title={EVIDENCE_DEFINITIONS[evidence as EvidenceGrade]}>
          {formatEvidenceGrade(evidence, reportLanguage)}
        </Badge>
        <Badge className={statusClass(status)}>{statusLabel(status, reportLanguage)}</Badge>
        {risk && <Badge className={riskClass(risk)}>{formatSpeculationRisk(risk, reportLanguage)}</Badge>}
      </div>
      {(item.nextVerification || item.whyItMatters) && (
        <p className="mt-2 text-xxs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
          {item.whyItMatters ? `${text('importance')}: ${item.whyItMatters}${!reportLanguage.startsWith('zh-') ? '. ' : '；'}` : ''}{text('verificationPath')}: {line(item.nextVerification, !reportLanguage.startsWith('zh-') ? 'Consult primary documents, public data, independent reporting, or a response from the involved party.' : '寻找原始材料、公开数据、多方报道或当事方回应。')}
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
      reportLanguage: normalizeReportLanguage(auditMeta?.reportLanguage),
      createdAt: auditMeta?.createdAt || '',
      viewCount: auditMeta?.viewCount,
      isPublic: auditMeta?.isPublic,
    },
    generationScope: result.report_meta?.generated_scope || '历史记录兼容展示；新报告不再展开九镜方法步骤。',
    scoreExplanation: result.report_meta?.scoring_note || '评分用于衡量报道结构与证据状态，不等同于判断新闻真假。',
    sourceInterpretation: {
      whatItSays: result.news_summary || '',
      coreClaims: result.nine_mirror_review?.atomic_claims?.slice(0, 3).map((item: any) => item.claim) || [],
      mainActors: result.nine_mirror_review?.interest_cost_map?.slice(0, 5).map((item: any) => item.actor) || [],
      keyEvidence: result.narrative_supporting_evidence?.slice(0, 4).map((item: any) => item.original_basis || item.detail) || [],
      narrativeStyle: result.nine_mirror_review?.narrative_frame_analysis?.moral_position || '历史记录未单独保存该归纳。',
      likelyReaderImpression: result.nine_mirror_review?.narrative_frame_analysis?.implied_solution || '历史记录未单独保存该归纳。',
    },
    newsSummary: result.news_summary || '',
    oneSentenceConclusion: result.one_sentence_conclusion || '',
    readingValue: (result.read_worth?.label || '暂无法判断') as ReadWorthLabel,
    readingValueReason: '历史记录未单独保存阅读价值理由；当前标签由评分和证据状态重新计算。',
    read_worth: result.read_worth,
    scores,
    scoreReasons: {
      credibility: scoreSummary.score_reasoning?.credibility_score || '',
      informationCompleteness: scoreSummary.score_reasoning?.information_completeness_score || '',
      narrativeBias: scoreSummary.score_reasoning?.narrative_bias_score || '',
      evidenceStrength: scoreSummary.score_reasoning?.evidence_strength_score || '',
      speculationRisk: scoreSummary.score_reasoning?.speculation_risk_score || '',
    },
    normalReaderGuide: '先区分原文明确事实、合理推断和待验证假设；不要把原文叙事直接等同于事实全貌。',
    conclusionLayers: {
      confirmed: [],
      reasonableDoubts: [],
      cannotJudgeYet: result.web_verification?.unconfirmed_items || [],
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
    cannotConclude: result.web_verification?.unconfirmed_items || ['历史记录未单独保存该章节。'],
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
    if (isQuick(clean)) return clean;
    if (isDeep(clean)) {
      return {
        ...clean,
        meta: {
          ...clean.meta,
          modelName: auditMeta?.modelName || clean.meta.modelName,
        },
        onlineVerification: {
          ...clean.onlineVerification,
          unableToConfirm: (clean.onlineVerification?.unableToConfirm || [])
            .map((item: unknown) => formatUnconfirmedItem(item))
            .filter(Boolean),
        },
      };
    }
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

function OriginalContentPanel({ originalContent, reportLanguage = 'zh-CN' }: { originalContent?: string; reportLanguage?: string }) {
  const [open, setOpen] = useState(false);
  if (!originalContent?.trim()) return null;
  const text = (key: string) => getReportText(key, reportLanguage);
  return (
    <Section title={text('articleOriginal')} aside={<button type="button" onClick={() => setOpen((value) => !value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 active:scale-[0.98] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">{open ? text('hideOriginal') : text('showOriginal')}</button>}>
      {!open ? (
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{text('originalCollapsed')}</p>
      ) : (
        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs leading-6 text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{originalContent}</pre>
      )}
    </Section>
  );
}

function limitedItems<T>(items: T[], limit: number) {
  return limit >= 999 ? items : items.slice(0, limit);
}

function compactAside(total: number, limit: number, reportLanguage = 'zh-CN') {
  if (limit >= 999 || total <= limit) return undefined;
  return <span className="text-xxs font-semibold text-gray-400">{!reportLanguage.startsWith('zh-') ? `Showing ${limit} of ${total}; the complete report is available in Markdown.` : `已优先显示 ${limit}/${total} 条，完整内容见 Markdown`}</span>;
}

function ReadingValueSection({ label, reason, manualVerifications = [], reportLanguage }: { label: ReadWorthLabel; reason?: string; manualVerifications?: ManualVerificationRecord[]; reportLanguage?: string }) {
  const language = normalizeReportLanguage(reportLanguage);
  const verifiedCount = manualVerifications.filter((item) => item.outcome === 'verified').length;
  const unverifiedCount = manualVerifications.filter((item) => item.outcome === 'unverified').length;
  const hasVerificationUpdate = verifiedCount + unverifiedCount > 0;
  const originalReason = String(reason || '').trim();
  const legacyVerificationOnlyReason = language.startsWith('zh-')
    ? originalReason.startsWith('已根据 ') && originalReason.includes('用户核验标记重新计算')
    : originalReason.startsWith('Recalculated from ') && originalReason.includes('user verification marks');
  const visibleReason = legacyVerificationOnlyReason
    ? (!language.startsWith('zh-') ? 'This judgment combines information completeness, evidence strength, narrative steering, and unresolved verification questions.' : '该判断综合信息完整度、证据强度、叙事倾向性和待核验问题得出。')
    : originalReason;
  return (
    <Section title={getReportText('readingValue', language)}>
      <div data-verification-pulse className="grid gap-3 md:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        <ReadWorthVerdict label={label} displayLabel={getReadWorthDisplayLabel(label, language)} reportLanguage={language} />
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">
          {line(visibleReason, !language.startsWith('zh-') ? 'This judgment combines information completeness, evidence strength, narrative steering, and unresolved verification questions.' : '该判断综合信息完整度、证据强度、叙事倾向性和待核验问题得出。')}
          {hasVerificationUpdate && (
            <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs font-semibold leading-relaxed">
              <span className="text-[var(--color-text-muted)]">{language.startsWith('zh-') ? '核验更新：' : 'Verification update: '}</span>
              {verifiedCount > 0 && <span className="text-[var(--color-success)]">{language.startsWith('zh-') ? `已找到可核验材料 ${verifiedCount} 项` : `${verifiedCount} item${verifiedCount === 1 ? '' : 's'} marked material found`}</span>}
              {verifiedCount > 0 && unverifiedCount > 0 && <span className="text-[var(--color-text-subtle)]"> · </span>}
              {unverifiedCount > 0 && <span className="text-[var(--color-warning)]">{language.startsWith('zh-') ? `暂未找到可核验材料 ${unverifiedCount} 项` : `${unverifiedCount} item${unverifiedCount === 1 ? '' : 's'} marked not verified`}</span>}
              <span className="text-[var(--color-text-muted)]">{language.startsWith('zh-') ? '；指数已据此调整。' : '; the indicators were adjusted accordingly.'}</span>
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function ScoresSection({ report, quick = false }: { report: QuickAnalysisResult | DeepAnalysisResult; quick?: boolean }) {
  const language = normalizeReportLanguage(report.meta.reportLanguage);
  const text = (key: string) => getReportText(key, language);
  const rows = quick
    ? [
        [text('informationCompleteness'), report.scores.informationCompleteness, !language.startsWith('zh-') ? 'How complete the article’s essential information is' : '原文关键信息够不够'],
        [text('evidenceStrength'), report.scores.evidenceStrength, !language.startsWith('zh-') ? 'How strong the article’s evidence is' : '原文证据硬不硬'],
        [text('narrativeBias'), report.scores.narrativeBias, !language.startsWith('zh-') ? 'Whether the article guides readers in one direction' : '原文是否明显单向引导'],
      ]
    : [
        [text('credibility'), report.scores.credibility, text('scoreHelpCredibility')],
        [text('informationCompleteness'), report.scores.informationCompleteness, text('scoreHelpCompleteness')],
        [text('narrativeBias'), report.scores.narrativeBias, text('scoreHelpBias')],
        [text('evidenceStrength'), report.scores.evidenceStrength, text('scoreHelpEvidence')],
        [text('speculationUncertainty'), report.scores.speculationRisk, text('scoreHelpRisk')],
      ];

  return (
    <Section title={text('coreScores')} aside={<span className="text-xxs font-semibold text-gray-400">{text('scoreDisclaimer')}</span>}>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([name, value, help]) => (
          <div key={String(name)} data-verification-pulse className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
            <div className="text-xxs font-bold text-gray-500 dark:text-gray-400">{String(name)}</div>
            <div className="mt-1 text-2xl font-black text-gray-950 dark:text-white">{Number(value)}/100</div>
            <div className="mt-1 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">{String(help)}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WebVerificationView({ report }: { report: DeepAnalysisResult }) {
  const web = report.onlineVerification;
  const language = normalizeReportLanguage(report.meta.reportLanguage);
  const text = (key: string) => getReportText(key, language);
  if (!web.enabled || web.status === 'not_enabled') {
    return <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">{!language.startsWith('zh-') ? 'Web verification was not enabled for this report.' : '本次未启用联网核验'}</p>;
  }
  if (web.status === 'no_reliable_sources') {
    return <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">{text('noReliableSources')}</p>;
  }

  const groups = [
    [text('verifiedSources'), web.verifiedSources.filter(isUsefulOnlineSource)],
    [text('backgroundSources'), web.backgroundSources.filter(isUsefulOnlineSource)],
    [text('pendingLeads'), web.pendingLeads.filter(isUsefulOnlineSource)],
  ] as const;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {groups.map(([title, items]) => (
          <div key={title} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
            <h4 className="text-xs font-black text-gray-900 dark:text-white">{title}</h4>
            <div className="mt-2 space-y-2">
              {items.length === 0 ? (
                <p className="text-xs text-gray-400">{text('noReliableItems')}</p>
              ) : items.slice(0, 4).map((source, index) => (
                <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-100 bg-white p-2 text-xs transition hover:border-sky-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-sky-800">
                  <div className="line-clamp-2 font-bold text-gray-950 dark:text-white">{line(source.title, source.url ? safeHost(source.url, language) : (!language.startsWith('zh-') ? 'Source' : '来源标题'))}</div>
                  <p className="mt-1 line-clamp-2 text-gray-500 dark:text-gray-400">{source.relevance || source.note}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge className={statusClass(source.verificationStatus)}>{statusLabel(source.verificationStatus, language)}</Badge>
                    <Badge className={evidenceClass(source.evidenceGrade)}>{formatEvidenceGrade(source.evidenceGrade, language)}</Badge>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      {web.unableToConfirm.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
          <h4 className="text-xs font-black text-gray-900 dark:text-white">{!language.startsWith('zh-') ? 'Information that cannot yet be verified' : '暂无法确认的信息'}</h4>
          <ul className="mt-2 space-y-1.5">
            {web.unableToConfirm.map((item, index) => <li key={`${String(item)}-${index}`} className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">- {formatUnconfirmedItem(item)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function bullets(items: unknown[], reportLanguage = 'zh-CN') {
  const normalized = items.map((item) => formatUnconfirmedItem(item)).filter(Boolean);
  return normalized.length > 0 ? normalized.map((item) => `- ${item}`) : [`- ${getReportText('insufficientMaterial', reportLanguage)}`];
}

function mdCell(value: unknown) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>').trim() || '—';
}

function markdownTable(headers: string[], rows: unknown[][]) {
  return [
    `| ${headers.map(mdCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
  ];
}

function webVerificationMarkdown(report: DeepAnalysisResult) {
  const online = report.onlineVerification;
  const language = normalizeReportLanguage(report.meta.reportLanguage);
  const text = (key: string) => getReportText(key, language);
  if (!online?.enabled) {
    return [`## 13. ${text('webVerification')}`, '', !language.startsWith('zh-') ? 'Web verification was not enabled for this report.' : '本次未启用联网核验。', ''];
  }

  const rows = [
    ...online.verifiedSources.filter(isUsefulOnlineSource).map((item) => [text('verifiedSources'), item.title, item.url, statusLabel(item.verificationStatus, language), formatEvidenceGrade(item.evidenceGrade, language), item.relevance || item.note]),
    ...online.backgroundSources.filter(isUsefulOnlineSource).map((item) => [text('backgroundSources'), item.title, item.url, statusLabel(item.verificationStatus, language), formatEvidenceGrade(item.evidenceGrade, language), item.relevance || item.note]),
    ...online.pendingLeads.filter(isUsefulOnlineSource).map((item) => [text('pendingLeads'), item.title, item.url, statusLabel(item.verificationStatus, language), formatEvidenceGrade(item.evidenceGrade, language), item.relevance || item.note]),
  ];

  return [
    `## 13. ${text('webVerification')}`,
    '',
    `${!language.startsWith('zh-') ? 'Status' : '联网状态'}: ${online.status === 'has_results' ? (!language.startsWith('zh-') ? 'Usable sources found' : '已找到可用来源') : online.status === 'no_reliable_sources' ? text('noReliableSources') : (!language.startsWith('zh-') ? 'Not enabled' : '未启用')}`,
    '',
    ...(rows.length
      ? markdownTable(!language.startsWith('zh-') ? ['Category', 'Source title', 'Link', 'Verification status', 'Evidence grade', 'Supported or limited judgment'] : ['分类', '来源标题', '链接', '核验状态', '证据等级', '可支持或限制的判断'], rows)
      : [text('noReliableSources')]),
    '',
    `### ${!language.startsWith('zh-') ? 'Information that cannot yet be verified' : '暂无法核验的信息'}`,
    '',
    ...bullets(online.unableToConfirm || [], language),
    '',
  ];
}

function markdownForEnglish(report: QuickAnalysisResult | DeepAnalysisResult, originalContent?: string, qaMessages: ChatMessage[] = []) {
  if (isQuick(report)) {
    return [
      '# Guanyu · Quick analysis',
      '',
      '## 1. Article at a glance', '', report.originalReading || report.newsSummary,
      '', '## 2. Core claim', '', report.coreClaim,
      '', '## 3. Reading value', '', `${getReadWorthDisplayLabel(report.readingValue, 'en-US')}. ${report.readingValueReason}`,
      '', '## 4. One-sentence Guanyu view', '', report.oneSentenceJudgment,
      '', '## 5. Three key signals', '',
      `- Most credible information: ${report.quickSignals?.mostCredibleInfo || '—'}`,
      `- Largest information gap: ${report.quickSignals?.biggestGap || '—'}`,
      `- Narrative to watch: ${report.quickSignals?.narrativeToWatch || '—'}`,
      '', '## 6. Core indicators', '',
      ...markdownTable(['Indicator', 'Score', 'What it measures'], [
        ['Information completeness', report.scores.informationCompleteness, 'Whether essential information is present'],
        ['Evidence strength', report.scores.evidenceStrength, 'How strong the article’s evidence is'],
        ['Narrative steering', report.scores.narrativeBias, 'Whether the article guides readers in one direction'],
      ]),
      '', '## 7. Three questions worth asking next', '', ...bullets(report.questionsToAsk, 'en-US'),
      '', '## 8. Quick conclusion', '', report.quickConclusion,
      '', '## Appendix A. Follow-up questions', '',
      ...(qaMessages.length ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? 'My question' : 'Guanyu answer'}\n\n${message.content}`) : ['No follow-up questions yet.']),
      '', '## Appendix B. Original article', '', originalContent?.trim() || 'The original article was not saved.',
    ].join('\n');
  }

  const meta = report.meta;
  return [
    '# Guanyu · News narrative analysis report',
    '',
    '> This report does not declare what is true. It helps distinguish article statements, evidence gaps, narrative structure, and questions that need verification.',
    '', '## 1. Reading the article', '',
    `- What the article says: ${report.sourceInterpretation.whatItSays}`,
    `- Core claims: ${report.sourceInterpretation.coreClaims.join('; ') || '—'}`,
    `- Main actors: ${report.sourceInterpretation.mainActors.join('; ') || '—'}`,
    `- Key evidence in the article: ${report.sourceInterpretation.keyEvidence.join('; ') || '—'}`,
    `- Narrative style: ${report.sourceInterpretation.narrativeStyle}`,
    `- Likely reader takeaway: ${report.sourceInterpretation.likelyReaderImpression}`,
    '', '## 2. Reading value', '', `${getReadWorthDisplayLabel(report.readingValue, 'en-US')}. ${report.readingValueReason}`,
    '', '## 3. How a general reader can approach it', '', report.normalReaderGuide,
    '', '## 4. One-sentence Guanyu view', '', report.oneSentenceConclusion,
    '', '## 5. Core indicators', '',
    ...markdownTable(['Indicator', 'Score', 'Direction', 'Reason'], [
      ['Credibility', report.scores.credibility, 'Higher means more credible', report.scoreReasons.credibility],
      ['Information completeness', report.scores.informationCompleteness, 'Higher means more complete information', report.scoreReasons.informationCompleteness],
      ['Narrative steering', report.scores.narrativeBias, 'Higher means stronger framing', report.scoreReasons.narrativeBias],
      ['Evidence strength', report.scores.evidenceStrength, 'Higher means stronger evidence', report.scoreReasons.evidenceStrength],
      ['Speculation uncertainty', report.scores.speculationRisk, 'Higher means more verification is needed', report.scoreReasons.speculationRisk],
    ]),
    '', 'Scores describe reporting structure and evidence state. They do not determine whether a news report is true or false.',
    '', '## 6. Layers of conclusion', '',
    '### Can be confirmed', ...bullets(report.conclusionLayers.confirmed, 'en-US'),
    '', '### Reasonable doubts', ...bullets(report.conclusionLayers.reasonableDoubts, 'en-US'),
    '', '### Cannot yet be determined', ...bullets(report.conclusionLayers.cannotJudgeYet, 'en-US'),
    '', '## 7. Three key findings',
    ...report.keyFindings.map((item) => `- **${item.title}**: ${item.content} (${formatJudgmentType(item.judgmentType, 'en-US')}; ${formatEvidenceGrade(item.evidenceGrade, 'en-US')}; ${statusLabel(item.verificationStatus, 'en-US')}; ${formatSpeculationRisk(item.speculationRisk, 'en-US')}; verification: ${item.nextVerification})`),
    '', '## 8. Evidence supporting the article narrative',
    ...report.supportingEvidence.map((item) => `- ${item.content}; supports: ${item.supportsNarrative}; ${formatEvidenceGrade(item.evidenceGrade, 'en-US')}; ${statusLabel(item.verificationStatus, 'en-US')}; limitation: ${item.limitation}`),
    '', '## 9. Major information gaps',
    ...report.informationGaps.map((item) => `- **${item.title}**: ${item.description}; why it matters: ${item.whyItMatters}; ${formatEvidenceGrade(item.currentEvidenceGrade, 'en-US')}; ${statusLabel(item.verificationStatus, 'en-US')}; verification: ${item.nextVerification}`),
    '', '## 10. Key interest relationships',
    ...report.stakeholderRelations.map((item) => `- **${item.role}**: possible benefit: ${item.possibleBenefit || 'Not disclosed in the article; needs verification.'}; possible cost: ${item.possibleCost || 'Not disclosed in the article; needs verification.'}; ${formatJudgmentType(item.judgmentType, 'en-US')}; ${formatSpeculationRisk(item.speculationRisk, 'en-US')}; pending check: ${item.pendingVerification}`),
    '', '## 11. Alternative explanations',
    ...report.alternativeExplanations.map((item) => `- **${item.explanation}**: ${formatReasonableness(item.reasonableness, 'en-US')}; current evidence: ${item.currentEvidenceStatus}; ${formatSpeculationRisk(item.speculationRisk, 'en-US')}; needed verification: ${item.neededVerification}`),
    '', '## 12. Evidence and verification state',
    `- Strongest evidence: ${report.evidenceVerificationSummary.strongestEvidence}`,
    `- Weakest evidence: ${report.evidenceVerificationSummary.weakestEvidence}`,
    ...bullets(report.evidenceVerificationSummary.sourceSupportedClaims.map((item) => `Supported by the article only: ${item}`), 'en-US'),
    ...bullets(report.evidenceVerificationSummary.externallyVerifiedClaims.map((item) => `Externally verified: ${item}`), 'en-US'),
    ...bullets(report.evidenceVerificationSummary.pendingVerificationClaims.map((item) => `Needs external verification: ${item}`), 'en-US'),
    ...bullets(report.evidenceVerificationSummary.unableToVerifyClaims.map((item) => `Unable to verify: ${formatUnconfirmedItem(item)}`), 'en-US'),
    '', '## 13. Verification roadmap',
    ...report.verificationRoadmap.map((item, index) => {
      const record = report.manualVerifications?.find((entry) => entry.index === index);
      return `- **${item.question}**: ${formatMaterialType(item.materialType, 'en-US')}; ${formatPriority(item.priority, 'en-US')}; why it matters: ${item.whyItMatters}${record ? `; user verification: ${manualVerificationLabel(record.outcome, 'en-US')}` : ''}`;
    }),
    '', ...webVerificationMarkdown(report).slice(2),
    '## 14. Questions to ask next', '', ...bullets(report.questionsToAsk, 'en-US'),
    '', '## 15. Conclusions not yet supported', '', ...bullets(report.cannotConclude, 'en-US'),
    '', '## 16. Interpretation boundary', '', report.riskNotice,
    '', '## 17. Report metadata', '',
    ...markdownTable(['Item', 'Value'], [
      ['Article title', line(meta.title, 'Not supplied')],
      ['Article source', line(meta.source, 'Not supplied')],
      ['Published at', meta.publishedAt || 'Publication date could not be identified reliably'],
      ['Publication-date source', formatPublishedAtSource(meta.publishedAtSource, 'en-US') || meta.publishedAtSource],
      ['Publication-date confidence', formatConfidence(meta.publishedAtConfidence, 'en-US') || meta.publishedAtConfidence],
      ['Model', line(meta.modelName, 'Not supplied')],
      ['Reasoning depth', formatThinkingDepth(meta.reasoningDepth, 'en-US')],
      ['Report language', 'English'],
      ['Analysis mode', formatAnalysisMode(meta.analysisMode, 'en-US')],
      ['Generated at', line(meta.createdAt, 'Not supplied')],
      ['Methodology', 'Guanyu Nine-Lens Reading Method'],
    ]),
    '', '## 18. Appendix: Original article', '', originalContent?.trim() || 'The original article was not saved.',
    '', '## Appendix: Follow-up questions', '',
    ...(qaMessages.length ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? 'My question' : 'Guanyu answer'}\n\n${message.content}`) : ['No follow-up questions yet.']),
  ].join('\n');
}

function markdownFor(report: QuickAnalysisResult | DeepAnalysisResult, originalContent?: string, qaMessages: ChatMessage[] = []) {
  const meta = report.meta;
  const reportLanguage = normalizeReportLanguage(meta.reportLanguage);
  // Legacy quick reports and the Markdown template have full English copy. For
  // every non-Chinese target language this prevents a Chinese export from being
  // mixed into an otherwise localized report until its dedicated legacy format
  // is regenerated by the current deep-report pipeline.
  if (!reportLanguage.startsWith('zh-')) {
    return markdownForEnglish(report, originalContent, qaMessages);
  }
  if (isQuick(report)) {
    return [
      '# 观隅 · 快速分析',
      '',
      '## 1. 原文速读',
      '',
      report.originalReading || report.newsSummary,
      '',
      '## 2. 核心主张',
      '',
      report.coreClaim,
      '',
      '## 3. 阅读价值判断',
      '',
      `${report.readingValue}。${report.readingValueReason}`,
      '',
      '## 4. 一句话观隅审视',
      '',
      report.oneSentenceJudgment,
      '',
      '## 5. 三个关键信号',
      '',
      `- 最可信信息：${report.quickSignals?.mostCredibleInfo || '暂无'}`,
      `- 最大信息缺口：${report.quickSignals?.biggestGap || '暂无'}`,
      `- 最需警惕叙事：${report.quickSignals?.narrativeToWatch || '暂无'}`,
      '',
      '## 6. 核心指数',
      '',
      ...markdownTable(['指标', '分数', '作用'], [
        ['信息完整度', report.scores.informationCompleteness, '原文关键信息够不够'],
        ['证据强度', report.scores.evidenceStrength, '原文证据硬不硬'],
        ['叙事倾向性', report.scores.narrativeBias, '原文是否明显单向引导'],
      ]),
      '',
      '## 7. 最值得追问的 3 个问题',
      '',
      ...bullets(report.questionsToAsk),
      '',
      '## 8. 快速结论',
      '',
      report.quickConclusion,
      '',
      '## 附录 A. 交互式追问记录',
      '',
      ...(qaMessages.length ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? '我的问题' : '审视助手回答'}\n\n${message.content}`) : ['暂无交互式追问记录。']),
      '',
      '## 附录 B. 新闻原文',
      '',
      originalContent?.trim() || '未保存原文。',
    ].join('\n');
  }

  return [
    '# 观隅 · 新闻叙事审视报告',
    '',
    '> 本报告不替用户断言真相，只帮助看清新闻叙事结构、证据缺口、缺席视角和待验证问题。',
    '',
    '## 1. 原文解读',
    '',
    `- 原文在讲什么：${report.sourceInterpretation.whatItSays}`,
    `- 核心主张：${report.sourceInterpretation.coreClaims.join('；') || '暂无'}`,
    `- 主要主体：${report.sourceInterpretation.mainActors.join('；') || '暂无'}`,
    `- 原文关键证据：${report.sourceInterpretation.keyEvidence.join('；') || '暂无'}`,
    `- 叙事方式：${report.sourceInterpretation.narrativeStyle}`,
    `- 读者最可能带走的印象：${report.sourceInterpretation.likelyReaderImpression}`,
    '',
    '## 2. 阅读价值判断',
    '',
    `${report.readingValue}。${report.readingValueReason}`,
    '',
    '## 3. 给普通读者的读法',
    '',
    report.normalReaderGuide,
    '',
    '## 4. 一句话观隅审视',
    '',
    report.oneSentenceConclusion,
    '',
    '## 5. 核心指数',
    '',
    ...markdownTable(['指数', '分数', '方向说明', '评分理由'], [
      ['可信度', report.scores.credibility, '越高表示越可信', report.scoreReasons.credibility],
      ['信息完整度', report.scores.informationCompleteness, '越高表示信息越完整', report.scoreReasons.informationCompleteness],
      ['叙事倾向性', report.scores.narrativeBias, '越高表示引导性越强', report.scoreReasons.narrativeBias],
      ['证据强度', report.scores.evidenceStrength, '越高表示证据越充分', report.scoreReasons.evidenceStrength],
      ['推测不确定性', report.scores.speculationRisk, '越高表示越需要谨慎核验', report.scoreReasons.speculationRisk],
    ]),
    '',
    '评分用于衡量报道结构与证据状态，不等同于判断新闻真假。',
    '',
    '## 6. 结论分层',
    '',
    '### 可以确认',
    ...bullets(report.conclusionLayers.confirmed),
    '',
    '### 可以合理怀疑',
    ...bullets(report.conclusionLayers.reasonableDoubts),
    '',
    '### 暂不能判断',
    ...bullets(report.conclusionLayers.cannotJudgeYet),
    '',
    '## 7. 最关键的 3 个发现',
    ...report.keyFindings.map((item) => `- **${item.title}**：${item.content}（${item.judgmentType}，证据 ${item.evidenceGrade}，${statusLabel(item.verificationStatus)}，推测不确定性 ${item.speculationRisk}；验证：${item.nextVerification}）`),
    '',
    '## 8. 支持原文叙事的证据',
    ...report.supportingEvidence.map((item) => `- ${item.content}；支撑：${item.supportsNarrative}；证据 ${item.evidenceGrade}；${statusLabel(item.verificationStatus)}；局限：${item.limitation}`),
    '',
    '## 9. 主要信息缺口',
    ...report.informationGaps.map((item) => `- **${item.title}**：${item.description}；重要性：${item.whyItMatters}；证据 ${item.currentEvidenceGrade}；${statusLabel(item.verificationStatus)}；验证：${item.nextVerification}`),
    '',
    '## 10. 关键利益关系',
    ...report.stakeholderRelations.map((item) => `- **${item.role}**：可能利益：${item.possibleBenefit || '原文未披露，需核验'}；可能代价：${item.possibleCost || '原文未披露，需核验'}；${item.judgmentType}；推测不确定性 ${item.speculationRisk}；待验证：${item.pendingVerification}`),
    '',
    '## 11. 替代解释对照',
    ...report.alternativeExplanations.map((item) => `- **${item.explanation}**：合理性 ${item.reasonableness}；当前证据：${item.currentEvidenceStatus}；推测不确定性 ${item.speculationRisk}；需验证：${item.neededVerification}`),
    '',
    '## 12. 证据与核验状态',
    `- 最强证据：${report.evidenceVerificationSummary.strongestEvidence}`,
    `- 最弱证据：${report.evidenceVerificationSummary.weakestEvidence}`,
    ...bullets(report.evidenceVerificationSummary.sourceSupportedClaims.map((item) => `仅由原文支持：${item}`)),
    ...bullets(report.evidenceVerificationSummary.externallyVerifiedClaims.map((item) => `外部已核验：${item}`)),
    ...bullets(report.evidenceVerificationSummary.pendingVerificationClaims.map((item) => `待外部核验：${item}`)),
    ...bullets(report.evidenceVerificationSummary.unableToVerifyClaims.map((item) => `暂无法确认：${item}`)),
    '',
    '## 13. 验证路线图',
    ...report.verificationRoadmap.map((item, index) => {
      const record = report.manualVerifications?.find((entry) => entry.index === index);
      return `- **${item.question}**：材料类型 ${item.materialType}；优先级 ${item.priority}；重要性：${item.whyItMatters}${record ? `；用户核验：${manualVerificationLabel(record.outcome, 'zh-CN')}` : ''}`;
    }),
    '',
    '### 联网核验结果',
    ...(webVerificationMarkdown(report).slice(2)),
    '## 14. 继续追问清单',
    ...bullets(report.questionsToAsk),
    '',
    '## 15. 目前不能直接得出的结论',
    ...bullets(report.cannotConclude),
    '',
    '## 16. 风险提示',
    report.riskNotice,
    '',
    '## 17. 报告元信息',
    '',
    ...markdownTable(['项目', '内容'], [
      ['新闻标题', line(meta.title, '未填写')],
      ['新闻来源', line(meta.source, '未填写')],
      ['新闻发布时间', meta.publishedAt || '未能可靠识别发布时间'],
      ['发布时间来源', SOURCE_LABELS[meta.publishedAtSource] || meta.publishedAtSource],
      ['发布时间可信度', CONFIDENCE_LABELS[meta.publishedAtConfidence] || meta.publishedAtConfidence],
      ['使用模型', line(meta.modelName, '未填写')],
      ['思考强度', line(meta.reasoningDepth, '未填写')],
      ['报告语言', getReportLanguageLabel(meta.reportLanguage, meta.reportLanguage)],
      ['分析模式', line(meta.analysisMode, '未填写')],
      ['报告生成时间', line(meta.createdAt, '未填写')],
      ['方法论', report.methodology],
    ]),
    '',
    '## 18. 附录：新闻原文',
    '',
    originalContent?.trim() || '未保存原文。',
    '',
    '## 附录：交互式追问记录',
    '',
    ...(qaMessages.length ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? '我的问题' : '审视助手回答'}\n\n${message.content}`) : ['暂无交互式追问记录。']),
  ].join('\n');
}

function completionPreviewHtml(value: string) {
  const escaped = value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] || character));
  return escaped
    .replace(/&lt;span style=&quot;color:(#047857|#b91c1c)&quot;&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span style="color:$1;font-weight:700">$2</span>');
}

function AiCompletionButton({ auditId, reportLanguage }: { auditId: string; reportLanguage: string }) {
  const { t: uiText } = useUiLanguage();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [modelSource, setModelSource] = useState<ModelSourceSelection>('platform');
  const [platformModelConfigId, setPlatformModelConfigId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('2');
  const text = (key: string) => getReportText(key, reportLanguage);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), modelSource, platformModelConfigId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || text('completionFailed'));
      setMarkdown(String(data.markdown || ''));
    } catch (requestError: any) {
      setError(requestError?.message || text('completionFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const download = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'guanyu-ai-completion.md';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button type="button" onClick={() => setShowControls((value) => !value)} disabled={isGenerating} className="rounded-lg border border-[var(--color-success)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-success)] transition hover:bg-[var(--color-card-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
        {isGenerating ? text('generatingCompletion') : text('aiCompletion')}
      </button>
      {showControls && (
        <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <PlatformModelSelector
            compact
            operation="completion"
            source={modelSource}
            onSourceChange={setModelSource}
            selectedId={platformModelConfigId}
            onSelectedIdChange={setPlatformModelConfigId}
            onEstimatedCostChange={(cost) => setEstimatedCost(cost)}
          />
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={generate} disabled={isGenerating || (modelSource === 'platform' && !platformModelConfigId)} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:opacity-50">
              {isGenerating ? text('generatingCompletion') : `${text('aiCompletion')} · ${modelSource === 'custom' ? '0' : estimatedCost} ${uiText('modelSelector.credits', '点')}`}
            </button>
          </div>
        </div>
      )}
      {error && <span className="w-full text-right text-xxs font-semibold text-[var(--color-danger)]">{error}</span>}
      {markdown && (
        <section className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
            <h3 className="text-sm font-black text-[var(--color-text)]">{text('completionPreview')}</h3>
            <button type="button" onClick={download} className="rounded border border-[var(--color-border-strong)] px-2 py-1 text-xxs font-bold text-[var(--color-text)] hover:bg-[var(--color-card-hover)]">{text('downloadCompletion')}</button>
          </div>
          <div className="max-h-[38rem] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--color-text)]" dangerouslySetInnerHTML={{ __html: completionPreviewHtml(markdown) }} />
          </div>
        </section>
      )}
    </>
  );
}

function DownloadButton({ report, originalContent, qaMessages, auditId, canGenerateCard = false }: { report: QuickAnalysisResult | DeepAnalysisResult; originalContent?: string; qaMessages: ChatMessage[]; auditId?: string; canGenerateCard?: boolean }) {
  const { t } = useUiLanguage();
  const reportLanguage = normalizeReportLanguage(report.meta.reportLanguage);
  const downloadLocal = () => {
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const download = async () => {
    if (!auditId) return downloadLocal();
    setExporting(true); setExportError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'MARKDOWN' }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '导出失败');
      const blob = new Blob([data.content || ''], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = data.filename || 'guanyu-report.md'; link.click(); URL.revokeObjectURL(url);
    } catch (error: any) { setExportError(error?.message || '导出失败'); } finally { setExporting(false); }
  };
  const downloadPdf = async () => {
    if (!auditId) return;
    setExporting(true); setExportError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'PDF' }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('export.pdfFailed'));
      }
      const data = await response.json();
      if (!data.downloadUrl) throw new Error(t('export.pdfFailed'));
      const link = document.createElement('a');
      // Use the authenticated GET download endpoint after generation. This is
      // more reliable than a Blob URL for real browser downloads and avoids
      // retaining a second full PDF in client memory.
      link.href = data.downloadUrl;
      link.download = data.filename || 'guanyu-report.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error: any) { setExportError(error?.message || t('export.pdfFailed')); } finally { setExporting(false); }
  };
  const downloadWord = async () => {
    if (!auditId) return;
    setExporting(true); setExportError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'WORD' }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('export.wordFailed'));
      }
      const data = await response.json();
      if (!data.downloadUrl) throw new Error(t('export.wordFailed'));
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = data.filename || 'guanyu-report.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error: any) { setExportError(error?.message || t('export.wordFailed')); } finally { setExporting(false); }
  };

  return (
    <div data-gsap-reveal className="flex flex-wrap justify-end gap-2">
      {auditId && <button onClick={downloadWord} disabled={exporting} className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)] transition hover:bg-[var(--color-card-hover)] active:scale-[0.98] disabled:opacity-60">{exporting ? t('export.generating') : `${t('export.word')} · 1 ${t('billing.creditUnit')}`}</button>}
      {auditId && <button onClick={downloadPdf} disabled={exporting} className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)] transition hover:bg-[var(--color-card-hover)] disabled:opacity-60">{exporting ? t('export.generating') : `${t('export.pdf')} · 1 ${t('billing.creditUnit')}`}</button>}
      <button onClick={download} disabled={exporting} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 active:scale-[0.98] disabled:opacity-60 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300">
        {exporting ? t('export.generating') : `${t('export.markdown', getReportText('exportMarkdown', reportLanguage))} · 1 ${t('billing.creditUnit')}`}
      </button>
      {auditId && <AiCompletionButton auditId={auditId} reportLanguage={reportLanguage} />}
      {auditId && canGenerateCard && <GuanyuCardButton auditId={auditId} title={report.meta.title} reportLanguage={reportLanguage} />}
      {exportError && <span className="w-full text-right text-xxs font-semibold text-[var(--color-danger)]">{exportError}</span>}
    </div>
  );
}

function QuickReportView({ report, originalContent, qaMessages }: { report: QuickAnalysisResult; originalContent?: string; qaMessages: ChatMessage[] }) {
  const reportLanguage = normalizeReportLanguage(report.meta.reportLanguage);
  const questions = limitedItems(report.questionsToAsk, 3);
  return (
    <>
      <Section title={reportLanguage === 'en-US' ? '1. Article at a glance' : '1. 原文速读'}><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.originalReading || report.newsSummary}</p></Section>
      <Section title={reportLanguage === 'en-US' ? '2. Core claim' : '2. 核心主张'}><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.coreClaim}</p></Section>
      <ReadingValueSection label={report.readingValue} reason={report.readingValueReason} reportLanguage={report.meta.reportLanguage} />
      <Section title={reportLanguage === 'en-US' ? '4. One-sentence Guanyu view' : '4. 一句话观隅审视'}><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.oneSentenceJudgment}</p></Section>
      <Section title={reportLanguage === 'en-US' ? '5. Three key signals' : '5. 三个关键信号'}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {[
            [reportLanguage === 'en-US' ? 'Most credible information' : '最可信信息', report.quickSignals?.mostCredibleInfo],
            [reportLanguage === 'en-US' ? 'Largest information gap' : '最大信息缺口', report.quickSignals?.biggestGap],
            [reportLanguage === 'en-US' ? 'Narrative to watch' : '最需警惕叙事', report.quickSignals?.narrativeToWatch],
          ].map(([title, content]) => (
            <article key={title} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
              <div className="font-black text-gray-950 dark:text-white">{title}</div>
              <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{line(content)}</p>
            </article>
          ))}
        </div>
      </Section>
      <ScoresSection report={report} quick />
      <Section title={reportLanguage === 'en-US' ? '7. Three questions worth asking next' : '7. 最值得追问的 3 个问题'}>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">{questions.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{item}</li>)}</ul>
      </Section>
      <Section title={reportLanguage === 'en-US' ? '8. Quick conclusion' : '8. 快速结论'}><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.quickConclusion}</p></Section>
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} />
    </>
  );
}

function DeepReportView({ report, originalContent, qaMessages, displayLimit, auditId, canUpdateVerification, onVerificationUpdated }: { report: DeepAnalysisResult; originalContent?: string; qaMessages: ChatMessage[]; displayLimit: number; auditId?: string; canUpdateVerification?: boolean; onVerificationUpdated?: (result: unknown, outcome: ManualVerificationOutcome) => void }) {
  const reportLanguage = normalizeReportLanguage(report.meta.reportLanguage);
  const text = (key: string) => getReportText(key, reportLanguage);
  const keyFindings = limitedItems(report.keyFindings, displayLimit);
  const supportingEvidence = limitedItems(report.supportingEvidence, displayLimit);
  const informationGaps = limitedItems(report.informationGaps, displayLimit);
  const stakeholderRelations = limitedItems(report.stakeholderRelations, displayLimit);
  const alternativeExplanations = limitedItems(report.alternativeExplanations, displayLimit);
  const verificationRoadmap = limitedItems(report.verificationRoadmap, displayLimit);
  const questions = limitedItems(report.questionsToAsk, displayLimit);
  return (
    <>
      <Section title={text('sourceInterpretation')}>
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900 md:col-span-2">
            <div className="font-black text-gray-950 dark:text-white">{text('whatItSays')}</div>
            <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{report.sourceInterpretation.whatItSays || report.newsSummary}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">{text('coreClaims')}</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.coreClaims.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">{text('mainActors')}</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.mainActors.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">{text('keyEvidence')}</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.keyEvidence.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">{text('narrativeStyle')}</div><p className="mt-1 leading-relaxed">{report.sourceInterpretation.narrativeStyle}</p></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900 md:col-span-2"><div className="font-black">{text('readerImpression')}</div><p className="mt-1 leading-relaxed">{report.sourceInterpretation.likelyReaderImpression}</p></div>
        </div>
      </Section>
      <ReadingValueSection label={report.readingValue} reason={report.readingValueReason} manualVerifications={report.manualVerifications} reportLanguage={report.meta.reportLanguage} />
      <Section title={text('readerGuide')}><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.normalReaderGuide}</p></Section>
      <Section title={text('oneSentence')}><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.oneSentenceConclusion}</p></Section>
      <ScoresSection report={report} />
      <div data-verification-pulse><AuditCharts {...chartProps(report)} reportLanguage={reportLanguage} /></div>
      <Section title={text('conclusionLayers')}>
        <div className="grid gap-2 md:grid-cols-3">
          {[
            [text('confirmed'), report.conclusionLayers.confirmed],
            [text('reasonableDoubts'), report.conclusionLayers.reasonableDoubts],
            [text('cannotJudge'), report.conclusionLayers.cannotJudgeYet],
          ].map(([title, items]) => (
            <div key={String(title)} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
              <div className="font-black text-gray-950 dark:text-white">{String(title)}</div>
              <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">{(items as string[]).map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section title={text('findings')} aside={compactAside(report.keyFindings.length, displayLimit, reportLanguage)}><div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{keyFindings.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} reportLanguage={reportLanguage} />)}</div></Section>
      <Section title={text('supportingEvidence')} aside={compactAside(report.supportingEvidence.length, displayLimit, reportLanguage) || <span className="text-xxs font-semibold text-gray-400">{text('supportingEvidence')}</span>}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{supportingEvidence.map((item, index) => <JudgmentCard key={`${item.content}-${index}`} reportLanguage={reportLanguage} item={{ title: item.supportsNarrative, content: item.content, evidenceGrade: item.evidenceGrade, verificationStatus: item.verificationStatus, nextVerification: item.limitation }} />)}</div>
      </Section>
      <Section title={text('informationGaps')} aside={compactAside(report.informationGaps.length, displayLimit, reportLanguage)}><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{informationGaps.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} reportLanguage={reportLanguage} />)}</div></Section>
      <Section title={text('interests')} aside={compactAside(report.stakeholderRelations.length, displayLimit, reportLanguage)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {stakeholderRelations.map((item, index) => <JudgmentCard key={`${item.role}-${index}`} reportLanguage={reportLanguage} item={{ title: item.role, content: !reportLanguage.startsWith('zh-') ? `${text('possibleBenefit')}: ${item.possibleBenefit || 'Not disclosed in the article; needs verification.'}; ${text('possibleCost')}: ${item.possibleCost || 'Not disclosed in the article; needs verification.'}` : `可能利益：${item.possibleBenefit || '原文未披露，需进一步核验。'}；可能代价：${item.possibleCost || '原文未披露，需进一步核验。'}`, judgmentType: item.judgmentType, speculationRisk: item.speculationRisk, nextVerification: item.pendingVerification, verificationStatus: 'pending_verification', evidenceGrade: 'D' }} />)}
        </div>
      </Section>
      <Section title={text('alternatives')} aside={compactAside(report.alternativeExplanations.length, displayLimit, reportLanguage)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{alternativeExplanations.map((item, index) => <JudgmentCard key={`${item.explanation}-${index}`} reportLanguage={reportLanguage} item={{ title: item.explanation, content: !reportLanguage.startsWith('zh-') ? `${formatReasonableness(item.reasonableness, reportLanguage)}; ${text('currentEvidence')}: ${item.currentEvidenceStatus}` : `合理性：${item.reasonableness}；当前证据：${item.currentEvidenceStatus}`, speculationRisk: item.speculationRisk, nextVerification: item.neededVerification, verificationStatus: 'pending_verification', evidenceGrade: item.speculationRisk === '高' ? 'E' : 'D' }} />)}</div>
      </Section>
      <Section title={text('evidenceStatus')}>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><span className="font-bold">{text('strongestEvidence')}: </span>{report.evidenceVerificationSummary.strongestEvidence}</div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><span className="font-bold">{text('weakestEvidence')}: </span>{report.evidenceVerificationSummary.weakestEvidence}</div>
          {[
            [text('sourceSupported'), report.evidenceVerificationSummary.sourceSupportedClaims],
            [text('externallyVerified'), report.evidenceVerificationSummary.externallyVerifiedClaims],
            [text('pendingExternalVerification'), report.evidenceVerificationSummary.pendingVerificationClaims],
            [text('unableToVerify'), report.evidenceVerificationSummary.unableToVerifyClaims],
          ].map(([title, items]) => (
            <div key={String(title)} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
              <div className="font-black text-gray-900 dark:text-white">{String(title)}</div>
              <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">{(items as string[]).length ? (items as string[]).map((item, index) => <li key={`${item}-${index}`}>- {formatUnconfirmedItem(item)}</li>) : <li>{text('insufficientMaterial')}</li>}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section title={text('roadmap')} aside={compactAside(report.verificationRoadmap.length, displayLimit, reportLanguage)}>
        <VerificationRoadmap
          auditId={auditId}
          canUpdate={canUpdateVerification}
          items={verificationRoadmap}
          manualVerifications={report.manualVerifications}
          reportLanguage={reportLanguage}
          title={report.meta.title}
          source={report.meta.source}
          onUpdated={onVerificationUpdated}
        />
      </Section>
      <Section title={text('webVerification')}><WebVerificationView report={report} /></Section>
      <Section title={text('questions')} aside={compactAside(report.questionsToAsk.length, displayLimit, reportLanguage)}><ul className="grid grid-cols-1 gap-2 md:grid-cols-2">{questions.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{item}</li>)}</ul></Section>
      <Section title={text('notConcluded')}><ul className="space-y-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{report.cannotConclude.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">- {item}</li>)}</ul></Section>
      <Section title={text('riskNotice')}><p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">{report.riskNotice}</p></Section>
      <Section title={text('meta')}>
        <div className="grid gap-2 text-xs md:grid-cols-2">
          {[
            [text('articleTitle'), report.meta.title],
            [text('articleSource'), report.meta.source],
            [text('publishedAt'), report.meta.publishedAt || (!reportLanguage.startsWith('zh-') ? 'Publication date could not be identified reliably' : '未能可靠识别发布时间')],
            [text('modelName'), report.meta.modelName],
            [text('thinkingDepth'), formatThinkingDepth(report.meta.reasoningDepth, reportLanguage)],
            [text('reportLanguage'), reportLanguage],
            [text('analysisMode'), formatAnalysisMode(report.meta.analysisMode, reportLanguage)],
            [text('createdAt'), report.meta.createdAt],
            [text('methodology'), !reportLanguage.startsWith('zh-') ? 'Guanyu Nine-Lens Reading Method' : report.methodology],
          ].map(([key, value]) => <div key={key} className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900"><span className="font-bold text-gray-500">{key}{!reportLanguage.startsWith('zh-') ? ': ' : '：'}</span>{value}</div>)}
        </div>
      </Section>
      <OriginalContentPanel originalContent={originalContent} reportLanguage={reportLanguage} />
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} auditId={auditId} canGenerateCard={canUpdateVerification} />
    </>
  );
}

export default function AnalysisResultView({ result: rawResult, auditId, originalContent, auditMeta, canUpdateVerification = false }: AnalysisResultProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [workingResult, setWorkingResult] = useState<AnalysisResult>(rawResult);
  const [verificationPulse, setVerificationPulse] = useState(0);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const result = useNormalizedResult(workingResult, auditMeta);
  const [qaMessages, setQaMessages] = useState<ChatMessage[]>([]);
  const readWorth = result.read_worth || computeReadWorth(result);
  const readingLimit = 12;

  useEffect(() => {
    setWorkingResult(rawResult);
  }, [rawResult]);

  useGSAP(() => {
    if (!verificationPulse || !rootRef.current) return;
    const targets = Array.from(rootRef.current.querySelectorAll<HTMLElement>('[data-verification-pulse]'));
    const toast = rootRef.current.querySelector<HTMLElement>('[data-verification-toast]');
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (targets.length) {
      timeline.fromTo(targets, { y: 0, scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)' }, {
        y: -2,
        scale: 1.008,
        boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent)',
        duration: 0.24,
        stagger: 0.055,
        yoyo: true,
        repeat: 1,
        clearProps: 'transform,boxShadow',
      });
    }
    if (toast) timeline.fromTo(toast, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.24 }, '-=0.12');
  }, { scope: rootRef, dependencies: [verificationPulse], revertOnUpdate: true });

  const handleVerificationUpdated = (nextResult: unknown, outcome: ManualVerificationOutcome) => {
    setWorkingResult(nextResult as AnalysisResult);
    setVerificationNotice(outcome === 'verified'
      ? (result.meta.reportLanguage.startsWith('zh-') ? '已记录“验证存在”，核心指数与阅读价值已重新计算。' : 'Material found was recorded. Core scores and reading value were recalculated.')
      : (result.meta.reportLanguage.startsWith('zh-') ? '已记录“无法验证”，核心指数与阅读价值已重新计算。' : 'Not verified was recorded. Core scores and reading value were recalculated.'));
    setVerificationPulse((value) => value + 1);
  };

  return (
    <div ref={rootRef} className="space-y-3">
      {verificationNotice && <div data-verification-toast role="status" className="rounded-lg border border-[var(--color-success)]/35 bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] px-3 py-2 text-xs font-bold text-[var(--color-success)]">{verificationNotice}</div>}
      <GsapReveal className="space-y-4 sm:space-y-5" y={18} stagger={0.055}>
        {isQuick(result)
          ? <QuickReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} qaMessages={qaMessages} />
          : <DeepReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} qaMessages={qaMessages} displayLimit={readingLimit} auditId={auditId} canUpdateVerification={canUpdateVerification} onVerificationUpdated={handleVerificationUpdated} />}

        {auditId && <InteractiveQA auditId={auditId} messages={qaMessages} onMessagesChange={setQaMessages} />}
        {auditId && <DiscussionBoard auditId={auditId} />}
      </GsapReveal>
    </div>
  );
}

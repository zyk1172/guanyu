'use client';

import { readCompletionArticle } from '@/lib/ai-completion-core.mjs';
import { reportFilename } from '@/lib/report-filename.mjs';
import { Button, Input, Panel } from '@/components/ui/controls';
import { buildReportExport, renderMarkdownExport } from '@/lib/report-export-content';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { computeReadWorth } from '../lib/readWorth';
import {
  formatAnalysisMode,
  formatEvidenceGrade,
  formatJudgmentType,
  formatReasonableness,
  formatSpeculationRisk,
  formatThinkingDepth,
  formatUnconfirmedItem,
  formatVerificationStatus,
  getReportText,
} from '../lib/report-display-core.mjs';
import {
  AnalysisResult,
  DeepAnalysisResult,
  EvidenceGrade,
  getReadWorthDisplayLabel,
  getReadWorthEvidenceGuidance,
  ManualVerificationOutcome,
  ManualVerificationRecord,
  normalizeReportLanguage,
  QuickAnalysisResult,
  ReadWorthLabel,
  ReadWorthVerdict as ReadWorthVerdictType,
  SpeculationRisk,
  VerificationStatus,
  VerificationStatusCode,
} from '../lib/types';
import AuditCharts from './AuditCharts';
import DiscussionBoard from './DiscussionBoard';
import GuanyuCardButton from './GuanyuCardButton';
import InteractiveQA, { ChatMessage, type InteractiveQAHandle } from './InteractiveQA';
import SuggestedQuestions, { type QuestionAction } from './SuggestedQuestions';
import { useUiLanguage } from './LanguageProvider';
import ReadingNavigation from './ReadingNavigation';
import ReadWorthVerdict from './ReadWorthVerdict';
import ReportBrief from './ReportBrief';
import ReportText, { ReportEmphasisContext } from './ReportText';
import { useActiveModel } from './useActiveModel';
import VerificationRoadmap from './VerificationRoadmap';

interface AnalysisResultProps {
  result: AnalysisResult;
  relatedCoverage?: React.ReactNode;
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
    case 'A': return "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]";
    case 'B': return "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-link)]";
    case 'C': return "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
    case 'D': return "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
    case 'E': return "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]";
    default: return "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";
  }
}

function riskClass(risk?: SpeculationRisk | string) {
  if (risk === '低') return "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]";
  if (risk === '高') return "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]";
  return "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
}

function statusClass(status?: VerificationStatus | string) {
  const normalized = normalizeStatus(status);
  if (normalized === 'externally_verified') return "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]";
  if (normalized === 'source_supported') return "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-link)]";
  if (normalized === 'partially_supported') return "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-link)]";
  if (normalized === 'unable_to_verify') return "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";
  return "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
}

function Badge({ children, className, title }: { children: React.ReactNode; className: string; title?: string }) {
  return <span title={title} className={`ui-badge border ${className}`}>{children}</span>;
}

function Section({ title, children, aside, id }: { title: string; children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  const label = id ? title.replace(/^\d+[.．、]\s*/u, '') : title;
  return (
    <Panel id={id} data-reading-section={id ? label : undefined} className="result-card">
      <div className="mb-3 flex flex-col gap-2 border-b border-[var(--color-border)] pb-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 data-reading-title={id ? '' : undefined} className="text-sm font-bold text-[var(--color-text)]">{label}</h2>
        {aside}
      </div>
      {children}
    </Panel>
  );
}

function line(value: unknown, fallback = '当前材料不足，无法形成可靠判断') {
  const text = value === undefined || value === null ? '' : String(value).trim();
  return text && text !== '未提供' && text !== '暂无' ? text : fallback;
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
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs">
      <div className="text-sm font-bold leading-snug text-[var(--color-text)] md:text-base">{line(item.title, !reportLanguage.startsWith('zh-') ? 'Key finding' : '关键判断')}</div>
      <p className="mt-1 leading-relaxed text-[var(--color-text-muted)]"><ReportText>{line(item.content || item.description || item.detail, text('insufficientMaterial'))}</ReportText></p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.judgmentType && (
          <Badge className="border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-link)]">{formatJudgmentType(item.judgmentType, reportLanguage)}</Badge>
        )}
        <Badge className={evidenceClass(evidence)} title={EVIDENCE_DEFINITIONS[evidence as EvidenceGrade]}>
          {formatEvidenceGrade(evidence, reportLanguage)}
        </Badge>
        <Badge className={statusClass(status)}>{statusLabel(status, reportLanguage)}</Badge>
        {risk && <Badge className={riskClass(risk)}>{formatSpeculationRisk(risk, reportLanguage)}</Badge>}
      </div>
      {(item.nextVerification || item.whyItMatters) && (
        <p className="mt-2 text-xxs font-semibold leading-relaxed text-[var(--color-text-muted)]">
          <ReportText>{item.whyItMatters ? `${text('importance')}: ${item.whyItMatters}${!reportLanguage.startsWith('zh-') ? '. ' : '；'}` : ''}</ReportText><ReportText>{text('verificationPath')}</ReportText>: <ReportText>{line(item.nextVerification, !reportLanguage.startsWith('zh-') ? 'Consult primary documents, public data, independent reporting, or a response from the involved party.' : '寻找原始材料、公开数据、多方报道或当事方回应。')}</ReportText>
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
  const legacyReadWorth = computeReadWorth(result as AnalysisResult);
  const readingUtility = legacyReadWorth.factors || {
    publicImportance: 0,
    informationGain: 0,
    uniqueness: 0,
    explanatoryDepth: 0,
    actionability: 0,
    informationDensity: 0,
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
    readingValue: legacyReadWorth.label,
    readingValueReason: '历史记录未单独保存阅读价值理由；当前标签已按中性阅读档位兼容显示。',
    readingUtility,
    read_worth: legacyReadWorth,
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

function OriginalContentPanel({ originalContent, reportLanguage = 'zh-CN', sourceUrl }: { originalContent?: string; reportLanguage?: string; sourceUrl?: string }) {
  const [open, setOpen] = useState(false);
  if (!originalContent?.trim()) return null;
  const text = (key: string) => getReportText(key, reportLanguage);
  return (
    <Section id="report-original" title={text('articleOriginal')} aside={<Button variant="secondary" type="button" onClick={() => setOpen((value) => !value)}>{open ? text('hideOriginal') : text('showOriginal')}</Button>}>
      {sourceUrl && /^https?:\/\//i.test(sourceUrl) && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex min-h-11 items-center text-sm text-[var(--color-link)] underline">{reportLanguage.startsWith('zh') ? '查看报道原文 ↗' : 'Open original article ↗'}</a>}
      {!open ? (
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]"><ReportText>{text('originalCollapsed')}</ReportText></p>
      ) : (
        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs leading-6 text-[var(--color-text)]">{originalContent}</pre>
      )}
    </Section>
  );
}

function limitedItems<T>(items: T[], limit: number) {
  return limit >= 999 ? items : items.slice(0, limit);
}

function compactAside(total: number, limit: number, reportLanguage = 'zh-CN') {
  if (limit >= 999 || total <= limit) return undefined;
  return <span className="text-xxs font-semibold text-[var(--color-text-subtle)]">{!reportLanguage.startsWith('zh-') ? `Showing ${limit} of ${total}; the complete report is available in Markdown.` : `已优先显示 ${limit}/${total} 条，完整内容见 Markdown`}</span>;
}

function ReadingValueSection({ label, reason, verdict, manualVerifications = [], reportLanguage }: { label: ReadWorthLabel; reason?: string; verdict?: ReadWorthVerdictType; manualVerifications?: ManualVerificationRecord[]; reportLanguage?: string }) {
  const language = normalizeReportLanguage(reportLanguage);
  const verifiedCount = manualVerifications.filter((item) => item.outcome === 'verified').length;
  const unverifiedCount = manualVerifications.filter((item) => item.outcome === 'unverified').length;
  const hasVerificationUpdate = verifiedCount + unverifiedCount > 0;
  const originalReason = String(reason || '').trim();
  const legacyVerificationOnlyReason = language.startsWith('zh-')
    ? originalReason.startsWith('已根据 ') && originalReason.includes('用户核验标记重新计算')
    : originalReason.startsWith('Recalculated from ') && originalReason.includes('user verification marks');
  const visibleReason = legacyVerificationOnlyReason
    ? (!language.startsWith('zh-') ? 'Reading value is based on expected information utility; evidence quality is shown separately as reading guidance.' : '阅读价值依据预期信息收益判断；证据质量另行作为阅读提示展示。')
    : originalReason;
  const evidenceGuidance = getReadWorthEvidenceGuidance(verdict?.evidencePosture || 'cautious_reading', language);
  return (
    <Section id="report-full" title={getReportText('readingValue', language)}>
      <div className="grid gap-3 md:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
        <ReadWorthVerdict label={label} displayLabel={getReadWorthDisplayLabel(label, language)} reportLanguage={language} />
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm leading-relaxed text-[var(--color-text)]">
          {line(visibleReason, !language.startsWith('zh-') ? 'Reading value is based on expected information utility; evidence quality is shown separately as reading guidance.' : '阅读价值依据预期信息收益判断；证据质量另行作为阅读提示展示。')}
          <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            <span className="ui-badge mr-2 inline-flex border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text)]">{evidenceGuidance.label}</span>
            <ReportText>{evidenceGuidance.guidance}</ReportText>
          </p>
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

function DataAnalysisSection({ report }: { report: DeepAnalysisResult }) {
  const language = normalizeReportLanguage(report.meta.reportLanguage);
  const text = (key: string) => getReportText(key, language);
  const details = [
    { label: text('dataAnalysisEvidence'), reasons: [line(report.scoreReasons?.credibility, '') || report.scoreReasons?.evidenceStrength] },
    { label: text('dataAnalysisNarrative'), reasons: [report.scoreReasons?.informationCompleteness, report.scoreReasons?.narrativeBias] },
    { label: text('dataAnalysisUncertainty'), reasons: [report.scoreReasons?.speculationRisk] },
  ];

  return (
    <Section id="report-scores" title={text('dataAnalysis')}>
      <dl className="space-y-4">
        {details.map(({ label, reasons }) => (
          <div key={label} className="grid min-w-0 gap-1 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-4">
            <dt className="text-xs font-bold text-[var(--color-text)]">{label}</dt>
            <dd className="min-w-0 break-words text-sm leading-relaxed text-[var(--color-text-muted)]"><ReportText>{line([...new Set(reasons.map(reason => line(reason, '')).filter(Boolean))].join(' '), text('insufficientMaterial'))}</ReportText></dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ScoresSection({ report }: { report: QuickAnalysisResult }) {
  const language = normalizeReportLanguage(report.meta.reportLanguage);
  const text = (key: string) => getReportText(key, language);
  const rows = [
    [text('informationCompleteness'), report.scores.informationCompleteness, !language.startsWith('zh-') ? 'How complete the article’s essential information is' : '原文关键信息够不够'],
    [text('evidenceStrength'), report.scores.evidenceStrength, !language.startsWith('zh-') ? 'How strong the article’s evidence is' : '原文证据硬不硬'],
    [text('narrativeBias'), report.scores.narrativeBias, !language.startsWith('zh-') ? 'Whether the article guides readers in one direction' : '原文是否明显单向引导'],
  ];

  return (
    <Section id="report-scores" title={text('coreScores')} aside={<span className="text-xxs font-semibold text-[var(--color-text-subtle)]">{text('scoreDisclaimer')}</span>}>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([name, value, help]) => (
          <div key={String(name)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div className="text-xxs font-bold text-[var(--color-text-muted)]">{String(name)}</div>
            <div className="mt-1 text-2xl font-bold text-[var(--color-text)]">{Number(value)}/100</div>
            <div className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{String(help)}</div>
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
    return <p className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-text-muted)]"><ReportText>{!language.startsWith('zh-') ? 'Web verification was not enabled for this report.' : '本次未启用联网核验'}</ReportText></p>;
  }
  if (web.status === 'no_reliable_sources') {
    return <p className="rounded-lg border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-xs font-semibold text-[var(--color-warning)]"><ReportText>{text('noReliableSources')}</ReportText></p>;
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
          <div key={title} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <h4 className="text-xs font-bold text-[var(--color-text)]">{title}</h4>
            <div className="mt-2 space-y-2">
              {items.length === 0 ? (
                <p className="text-xs text-[var(--color-text-subtle)]"><ReportText>{text('noReliableItems')}</ReportText></p>
              ) : items.slice(0, 4).map((source, index) => (
                <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs transition hover:border-[var(--color-primary)]">
                  <div className="line-clamp-2 font-bold text-[var(--color-text)]">{line(source.title, source.url ? safeHost(source.url, language) : (!language.startsWith('zh-') ? 'Source' : '来源标题'))}</div>
                  <p className="mt-1 line-clamp-2 text-[var(--color-text-muted)]"><ReportText>{source.relevance || source.note}</ReportText></p>
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
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <h4 className="text-xs font-bold text-[var(--color-text)]">{!language.startsWith('zh-') ? 'Information that cannot yet be verified' : '暂无法确认的信息'}</h4>
          <ul className="mt-2 space-y-1.5">
            {web.unableToConfirm.map((item, index) => <li key={`${String(item)}-${index}`} className="text-xs leading-relaxed text-[var(--color-text-muted)]">- <ReportText>{formatUnconfirmedItem(item)}</ReportText></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function AiCompletionButton({ auditId, reportLanguage }: { auditId: string; reportLanguage: string }) {
  const { t: uiText } = useUiLanguage();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const article = readCompletionArticle(markdown);
  const [completionVersion, setCompletionVersion] = useState<string | null>(null);
  const [completionLoaded, setCompletionLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const activeModel = useActiveModel('completion');
  const text = (key: string) => getReportText(key, reportLanguage);

  useEffect(() => {
    const controller = new AbortController();
    setCompletionLoaded(false);
    setMarkdown(null);
    setCompletionVersion(null);
    fetch(`/api/audits/${encodeURIComponent(auditId)}/completion`, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!controller.signal.aborted && data) {
          if (readCompletionArticle(data.markdown)) setMarkdown(data.markdown);
          setCompletionVersion(data.generatedAt ?? null);
          setCompletionLoaded(true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [auditId]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), expectedCompletionGeneratedAt: completionVersion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || text('completionFailed'));
      if (response.status === 202) throw new Error(data.message || text('generatingCompletion'));
      setMarkdown(String(data.markdown || ''));
      setCompletionVersion(data.generatedAt ?? null);
    } catch (requestError: any) {
      setError(requestError?.message || text('completionFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const download = () => {
    if (!markdown || !article) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFilename(article.title, 'md');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <Button variant="secondary" type="button" onClick={() => setShowControls((value) => !value)} disabled={isGenerating}>
        {isGenerating ? text('generatingCompletion') : text('aiCompletion')}
      </Button>
      {showControls && (
        <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              {uiText('modelSelector.accountModelHint', '使用账号设置中当前激活的模型。')}
            </p>
            <Button variant="primary" type="button" onClick={generate} disabled={!completionLoaded || isGenerating || activeModel.loading}>
              {isGenerating ? text('generatingCompletion') : `${text('aiCompletion')} · ${activeModel.source === 'custom' ? '0' : activeModel.estimatedCost} ${uiText('modelSelector.credits', '点')}`}
            </Button>
          </div>
        </div>
      )}
      {error && <span className="w-full text-right text-xxs font-semibold text-[var(--color-danger)]">{error}</span>}
      {article && (
        <Panel className="w-full">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
            <h3 className="text-sm font-bold text-[var(--color-text)]">{text('completionPreview')}</h3>
            <Button variant="secondary" type="button" onClick={download}>{text('downloadCompletion')}</Button>
          </div>
          <article className="mx-auto max-w-3xl space-y-4 [overflow-wrap:anywhere]">
            <h4 className="ui-page-title">{article.title}</h4>
            {article.paragraphs.map((paragraph: string, index: number) => <p key={index} className="text-base leading-7">{paragraph}</p>)}
          </article>
        </Panel>
      )}
    </>
  );
}

function DownloadButton({ report, originalContent, qaMessages, auditId, canGenerateCard = false }: { report: QuickAnalysisResult | DeepAnalysisResult; originalContent?: string; qaMessages: ChatMessage[]; auditId?: string; canGenerateCard?: boolean }) {
  const { t } = useUiLanguage();
  const reportLanguage = normalizeReportLanguage(report.meta.reportLanguage);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [exporting, setExporting] = useState<'MARKDOWN' | 'PDF' | 'WORD' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const canIncludeOriginal = Boolean(originalContent?.trim());
  const withOriginal = includeOriginal && canIncludeOriginal;

  function saveFile(href: string, filename: string) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function saveMarkdown(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    saveFile(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function download(format: 'MARKDOWN' | 'PDF' | 'WORD') {
    if (exporting) return;
    const failure = format === 'PDF' ? t('export.pdfFailed') : format === 'WORD' ? t('export.wordFailed') : t('export.markdownFailed');
    setExporting(format);
    setExportError(null);
    try {
      if (!auditId) {
        const meta = report.meta;
        const createdAt = new Date(meta.createdAt);
        const snapshot = buildReportExport({
          ...meta, id: '', originalContent: originalContent || '', newsSummary: report.newsSummary,
          createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
          reportVersion: 1, auditResultJson: JSON.stringify(report),
        }, {
          includeOriginal: withOriginal,
          followups: qaMessages.flatMap((item, index) => {
            const previous = qaMessages[index - 1];
            return item.role === 'assistant' && previous?.role === 'user'
              ? [{ question: previous.content, answer: item.content, sources: item.research?.sources }]
              : [];
          }),
        });
        saveMarkdown(renderMarkdownExport(snapshot), reportFilename(meta.title, 'md'));
        return;
      }
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, includeOriginal: withOriginal }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || failure);
      if (format === 'MARKDOWN' && typeof data.content === 'string') saveMarkdown(data.content, data.filename);
      else if (format !== 'MARKDOWN' && data.downloadUrl) saveFile(data.downloadUrl, data.filename);
      else throw new Error(failure);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : failure);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canIncludeOriginal && <label className="mr-2">
        <Input type="checkbox" checked={withOriginal} onChange={event => setIncludeOriginal(event.target.checked)} disabled={!!exporting} />
        {t('export.includeOriginal')}
      </label>}
      {auditId && <Button variant="secondary" onClick={() => void download('WORD')} disabled={!!exporting} busy={exporting === 'WORD'}>{exporting === 'WORD' ? t('export.generating') : `${t('export.word')} · 1 ${t('billing.creditUnit')}`}</Button>}
      {auditId && <Button variant="secondary" onClick={() => void download('PDF')} disabled={!!exporting} busy={exporting === 'PDF'}>{exporting === 'PDF' ? t('export.generating') : `${t('export.pdf')} · 1 ${t('billing.creditUnit')}`}</Button>}
      <Button variant="primary" onClick={() => void download('MARKDOWN')} disabled={!!exporting} busy={exporting === 'MARKDOWN'}>
        {exporting === 'MARKDOWN' ? t('export.generating') : `${t('export.markdown', getReportText('exportMarkdown', reportLanguage))}${auditId ? ` · 1 ${t('billing.creditUnit')}` : ''}`}
      </Button>
      {auditId && <AiCompletionButton auditId={auditId} reportLanguage={reportLanguage} />}
      {auditId && canGenerateCard && <GuanyuCardButton auditId={auditId} title={report.meta.title} reportLanguage={reportLanguage} />}
      {exportError && <span role="alert" className="w-full text-right text-xxs font-semibold text-[var(--color-danger)]">{exportError}</span>}
    </div>
  );
}

function QuickReportView({ report, originalContent, qaMessages, questionAction }: { report: QuickAnalysisResult; originalContent?: string; qaMessages: ChatMessage[]; questionAction?: QuestionAction }) {
  const reportLanguage = normalizeReportLanguage(report.meta.reportLanguage);
  const questions = limitedItems(report.questionsToAsk, 3);
  return (
    <>
      <Section title={reportLanguage === 'en-US' ? '1. Article at a glance' : '1. 原文速读'}><p className="text-sm leading-relaxed text-[var(--color-text)]"><ReportText>{report.originalReading || report.newsSummary}</ReportText></p></Section>
      <Section title={reportLanguage === 'en-US' ? '2. Core claim' : '2. 核心主张'}><p className="text-sm font-bold leading-relaxed text-[var(--color-text)]"><ReportText>{report.coreClaim}</ReportText></p></Section>
      <ReadingValueSection label={report.readingValue} reason={report.readingValueReason} verdict={report.read_worth} reportLanguage={report.meta.reportLanguage} />
      <Section title={reportLanguage === 'en-US' ? '4. One-sentence Guanyu view' : '4. 一句话观隅审视'}><p className="text-sm font-bold leading-relaxed text-[var(--color-text)]"><ReportText>{report.oneSentenceJudgment}</ReportText></p></Section>
      <Section title={reportLanguage === 'en-US' ? '5. Three key signals' : '5. 三个关键信号'}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {[
            [reportLanguage === 'en-US' ? 'Most credible information' : '最可信信息', report.quickSignals?.mostCredibleInfo],
            [reportLanguage === 'en-US' ? 'Largest information gap' : '最大信息缺口', report.quickSignals?.biggestGap],
            [reportLanguage === 'en-US' ? 'Narrative to watch' : '最需警惕叙事', report.quickSignals?.narrativeToWatch],
          ].map(([title, content]) => (
            <article key={title} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs">
              <div className="font-bold text-[var(--color-text)]">{title}</div>
              <p className="mt-1 leading-relaxed text-[var(--color-text-muted)]"><ReportText>{line(content)}</ReportText></p>
            </article>
          ))}
        </div>
      </Section>
      <ScoresSection report={report} />
      <Section title={reportLanguage === 'en-US' ? '7. Three questions worth asking next' : '7. 最值得追问的 3 个问题'}>
        <SuggestedQuestions questions={questions} action={questionAction} columns={3} />
      </Section>
      <Section title={reportLanguage === 'en-US' ? '8. Quick conclusion' : '8. 快速结论'}><p className="text-sm leading-relaxed text-[var(--color-text)]"><ReportText>{report.quickConclusion}</ReportText></p></Section>
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} />
    </>
  );
}

function DeepReportView({ relatedCoverage, report, originalContent, qaMessages, displayLimit, auditId, canUpdateVerification, onVerificationUpdated, questionAction }: { report: DeepAnalysisResult; originalContent?: string; qaMessages: ChatMessage[]; displayLimit: number; auditId?: string; canUpdateVerification?: boolean; onVerificationUpdated?: (result: unknown, outcome: ManualVerificationOutcome) => void; relatedCoverage?: React.ReactNode; questionAction?: QuestionAction }) {
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
      <ReportBrief report={report} originalContent={originalContent} />
      {relatedCoverage}
      <Section id="report-interpretation" title={text('sourceInterpretation')}>
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 md:col-span-2">
            <div className="font-bold text-[var(--color-text)]">{text('whatItSays')}</div>
            <p className="mt-1 leading-relaxed text-[var(--color-text-muted)]"><ReportText>{report.sourceInterpretation.whatItSays || report.newsSummary}</ReportText></p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"><div className="font-bold">{text('coreClaims')}</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.coreClaims.map((item, index) => <li key={`${item}-${index}`}>- <ReportText>{item}</ReportText></li>)}</ul></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"><div className="font-bold">{text('mainActors')}</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.mainActors.map((item, index) => <li key={`${item}-${index}`}>- <ReportText>{item}</ReportText></li>)}</ul></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"><div className="font-bold">{text('keyEvidence')}</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.keyEvidence.map((item, index) => <li key={`${item}-${index}`}>- <ReportText>{item}</ReportText></li>)}</ul></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"><div className="font-bold">{text('narrativeStyle')}</div><p className="mt-1 leading-relaxed"><ReportText>{report.sourceInterpretation.narrativeStyle}</ReportText></p></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 md:col-span-2"><div className="font-bold">{text('readerImpression')}</div><p className="mt-1 leading-relaxed"><ReportText>{report.sourceInterpretation.likelyReaderImpression}</ReportText></p></div>
        </div>
      </Section>
      <ReadingValueSection label={report.readingValue} reason={report.readingValueReason} verdict={report.read_worth} manualVerifications={report.manualVerifications} reportLanguage={report.meta.reportLanguage} />
      <Section id="report-guide" title={text('readerGuide')}><p className="text-sm leading-relaxed text-[var(--color-text)]"><ReportText>{report.normalReaderGuide}</ReportText></p></Section>
      <Section id="report-conclusion" title={text('oneSentence')}><p className="text-sm font-bold leading-relaxed text-[var(--color-text)]"><ReportText>{report.oneSentenceConclusion}</ReportText></p></Section>
      <DataAnalysisSection report={report} />
      <div><AuditCharts {...chartProps(report)} reportLanguage={reportLanguage} /></div>
      <Section id="report-conclusion-layers" title={text('conclusionLayers')}>
        <div className="grid gap-2 md:grid-cols-3">
          {[
            [text('confirmed'), report.conclusionLayers.confirmed],
            [text('reasonableDoubts'), report.conclusionLayers.reasonableDoubts],
            [text('cannotJudge'), report.conclusionLayers.cannotJudgeYet],
          ].map(([title, items]) => (
            <div key={String(title)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs">
              <div className="font-bold text-[var(--color-text)]">{String(title)}</div>
              <ul className="mt-2 space-y-1 text-[var(--color-text-muted)]">{(items as string[]).map((item, index) => <li key={`${item}-${index}`}>- <ReportText>{item}</ReportText></li>)}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section id="report-findings" title={text('findings')} aside={compactAside(report.keyFindings.length, displayLimit, reportLanguage)}><div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{keyFindings.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} reportLanguage={reportLanguage} />)}</div></Section>
      <Section id="report-supporting" title={text('supportingEvidence')} aside={compactAside(report.supportingEvidence.length, displayLimit, reportLanguage) || <span className="text-xxs font-semibold text-[var(--color-text-subtle)]">{text('supportingEvidence')}</span>}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{supportingEvidence.map((item, index) => <JudgmentCard key={`${item.content}-${index}`} reportLanguage={reportLanguage} item={{ title: item.supportsNarrative, content: item.content, evidenceGrade: item.evidenceGrade, verificationStatus: item.verificationStatus, nextVerification: item.limitation }} />)}</div>
      </Section>
      <Section id="report-gaps" title={text('informationGaps')} aside={compactAside(report.informationGaps.length, displayLimit, reportLanguage)}><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{informationGaps.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} reportLanguage={reportLanguage} />)}</div></Section>
      <Section id="report-stakeholders" title={text('interests')} aside={compactAside(report.stakeholderRelations.length, displayLimit, reportLanguage)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {stakeholderRelations.map((item, index) => <JudgmentCard key={`${item.role}-${index}`} reportLanguage={reportLanguage} item={{ title: item.role, content: !reportLanguage.startsWith('zh-') ? `${text('possibleBenefit')}: ${item.possibleBenefit || 'Not disclosed in the article; needs verification.'}; ${text('possibleCost')}: ${item.possibleCost || 'Not disclosed in the article; needs verification.'}` : `可能利益：${item.possibleBenefit || '原文未披露，需进一步核验。'}；可能代价：${item.possibleCost || '原文未披露，需进一步核验。'}`, judgmentType: item.judgmentType, speculationRisk: item.speculationRisk, nextVerification: item.pendingVerification, verificationStatus: 'pending_verification', evidenceGrade: 'D' }} />)}
        </div>
      </Section>
      <Section id="report-alternatives" title={text('alternatives')} aside={compactAside(report.alternativeExplanations.length, displayLimit, reportLanguage)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{alternativeExplanations.map((item, index) => <JudgmentCard key={`${item.explanation}-${index}`} reportLanguage={reportLanguage} item={{ title: item.explanation, content: !reportLanguage.startsWith('zh-') ? `${formatReasonableness(item.reasonableness, reportLanguage)}; ${text('currentEvidence')}: ${item.currentEvidenceStatus}` : `合理性：${item.reasonableness}；当前证据：${item.currentEvidenceStatus}`, speculationRisk: item.speculationRisk, nextVerification: item.neededVerification, verificationStatus: 'pending_verification', evidenceGrade: item.speculationRisk === '高' ? 'E' : 'D' }} />)}</div>
      </Section>
      <Section id="report-evidence" title={text('evidenceStatus')}>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"><span className="font-bold">{text('strongestEvidence')}: </span><ReportText>{report.evidenceVerificationSummary.strongestEvidence}</ReportText></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3"><span className="font-bold">{text('weakestEvidence')}: </span><ReportText>{report.evidenceVerificationSummary.weakestEvidence}</ReportText></div>
          {[
            [text('sourceSupported'), report.evidenceVerificationSummary.sourceSupportedClaims],
            [text('externallyVerified'), report.evidenceVerificationSummary.externallyVerifiedClaims],
            [text('pendingExternalVerification'), report.evidenceVerificationSummary.pendingVerificationClaims],
            [text('unableToVerify'), report.evidenceVerificationSummary.unableToVerifyClaims],
          ].map(([title, items]) => (
            <div key={String(title)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <div className="font-bold text-[var(--color-text)]">{String(title)}</div>
              <ul className="mt-2 space-y-1 text-[var(--color-text-muted)]">{(items as string[]).length ? (items as string[]).map((item, index) => <li key={`${item}-${index}`}>- <ReportText>{formatUnconfirmedItem(item)}</ReportText></li>) : <li><ReportText>{text('insufficientMaterial')}</ReportText></li>}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section id="report-roadmap" title={text('roadmap')} aside={compactAside(report.verificationRoadmap.length, displayLimit, reportLanguage)}>
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
      <Section id="report-web-verification" title={text('webVerification')}><WebVerificationView report={report} /></Section>
      <Section id="report-questions" title={text('questions')} aside={compactAside(report.questionsToAsk.length, displayLimit, reportLanguage)}><SuggestedQuestions questions={questions} action={questionAction} /></Section>
      <Section id="report-limits" title={text('notConcluded')}><ul className="space-y-2 text-xs leading-relaxed text-[var(--color-text)]">{report.cannotConclude.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">- <ReportText>{item}</ReportText></li>)}</ul></Section>
      <Section id="report-risk" title={text('riskNotice')}><p className="text-xs leading-relaxed text-[var(--color-text-muted)]"><ReportText>{report.riskNotice}</ReportText></p></Section>
      <Section id="report-metadata" title={text('meta')}>
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
          ].map(([key, value]) => <div key={key} className="rounded-lg bg-[var(--color-surface-muted)] p-2"><span className="font-bold text-[var(--color-text-muted)]">{key}{!reportLanguage.startsWith('zh-') ? ': ' : '：'}</span>{value}</div>)}
        </div>
      </Section>
      <OriginalContentPanel originalContent={originalContent} reportLanguage={reportLanguage} sourceUrl={report.meta.sourceUrl} />
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} auditId={auditId} canGenerateCard={canUpdateVerification} />
    </>
  );
}

export default function AnalysisResultView({ result: rawResult, relatedCoverage, auditId, originalContent, auditMeta, canUpdateVerification = false }: AnalysisResultProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [workingResult, setWorkingResult] = useState<AnalysisResult>(rawResult);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const result = useNormalizedResult(workingResult, auditMeta);
  const [qaMessages, setQaMessages] = useState<ChatMessage[]>([]);
  const qa = useRef<InteractiveQAHandle>(null);
  const [isAsking, setIsAsking] = useState(false);
  const followupModel = useActiveModel('followup', Boolean(auditId));
  const questionAction: QuestionAction | undefined = auditId ? {
    ask: question => qa.current?.askQuestion(question),
    disabled: isAsking || followupModel.loading || !!followupModel.error,
    loading: followupModel.loading, cost: followupModel.estimatedCost, error: followupModel.error,
  } : undefined;
  const readWorth = result.read_worth || computeReadWorth(result);
  const readingLimit = 12;

  useEffect(() => {
    setWorkingResult(rawResult);
  }, [rawResult]);

  const handleVerificationUpdated = (nextResult: unknown, outcome: ManualVerificationOutcome) => {
    setWorkingResult(nextResult as AnalysisResult);
    setVerificationNotice(outcome === 'verified'
      ? (result.meta.reportLanguage.startsWith('zh-') ? '已记录“验证存在”，核心指数与阅读价值已重新计算。' : 'Material found was recorded. Core scores and reading value were recalculated.')
      : (result.meta.reportLanguage.startsWith('zh-') ? '已记录“无法验证”，核心指数与阅读价值已重新计算。' : 'Not verified was recorded. Core scores and reading value were recalculated.'));
  };

  return (
    <div className="report-reading space-y-5">
      {verificationNotice && <div data-verification-toast role="status" className="rounded-lg border border-[var(--color-success)]/35 bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))] px-3 py-2 text-xs font-bold text-[var(--color-success)]">{verificationNotice}</div>}
      <div className={isQuick(result) ? undefined : 'report-layout'}>
        <div ref={contentRef} className="report-content min-w-0">
          <ReportEmphasisContext.Provider value={isDeep(result) ? result.emphasisPhrases || [] : []}>
          <div className="space-y-4 sm:space-y-5">
            {isQuick(result)
              ? <QuickReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} qaMessages={qaMessages} questionAction={questionAction} />
              : <DeepReportView relatedCoverage={relatedCoverage} report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} qaMessages={qaMessages} displayLimit={readingLimit} auditId={auditId} canUpdateVerification={canUpdateVerification} onVerificationUpdated={handleVerificationUpdated} questionAction={questionAction} />}
            {isQuick(result) && relatedCoverage}
          </div>
          </ReportEmphasisContext.Provider>
        </div>
        {!isQuick(result) && <ReadingNavigation language={result.meta.reportLanguage} contentRef={contentRef} />}
      </div>
      {auditId && <InteractiveQA ref={qa} auditId={auditId} activeModel={followupModel} onBusyChange={setIsAsking} messages={qaMessages} onMessagesChange={setQaMessages} />}
      {auditId && <DiscussionBoard auditId={auditId} />}
    </div>
  );
}

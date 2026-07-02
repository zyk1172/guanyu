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
import { useAudienceTheme } from './AudienceThemeProvider';
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
      <div className="text-sm font-black leading-snug text-gray-950 dark:text-white md:text-base">{line(item.title, '关键判断')}</div>
      <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{line(item.content || item.description || item.detail)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.judgmentType && (
          <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">{item.judgmentType}</Badge>
        )}
        <Badge className={evidenceClass(evidence)} title={EVIDENCE_DEFINITIONS[evidence as EvidenceGrade]}>
          证据 {evidence}
        </Badge>
        <Badge className={statusClass(status)}>{statusLabel(status)}</Badge>
        {risk && <Badge className={riskClass(risk)}>推测不确定性 {risk}</Badge>}
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

function AudienceReadingGuide({ theme }: { theme: string }) {
  if (theme === 'teen') {
    return (
      <Section title="青少年阅读提示">
        <div className="grid grid-cols-1 gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300 md:grid-cols-3">
          <p className="rounded-lg border border-sky-100 bg-sky-50 p-3 dark:border-sky-900/30 dark:bg-sky-950/20">先看“阅读价值”和“新闻简要总结”，判断这篇报道值不值得继续读。</p>
          <p className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/20">“证据等级”越靠近 A，越接近原始材料；D/E 更多是待核验线索。</p>
          <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">“推测不确定性”不是结论，只提醒你哪些地方需要继续查证。</p>
        </div>
      </Section>
    );
  }

  if (theme === 'senior') {
    return (
      <Section title="长者阅读提示">
        <div className="space-y-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
          <p>本页面已优先显示每组最重要的 2 条内容，减少长列表造成的阅读负担。</p>
          <p>建议阅读顺序：阅读价值、新闻简要总结、核心指数、最关键发现、主要信息缺口。完整报告可用 Markdown 导出查看。</p>
        </div>
      </Section>
    );
  }

  return null;
}

function limitedItems<T>(items: T[], limit: number) {
  return limit >= 999 ? items : items.slice(0, limit);
}

function compactAside(total: number, limit: number) {
  if (limit >= 999 || total <= limit) return undefined;
  return <span className="text-xxs font-semibold text-gray-400">已优先显示 {limit}/{total} 条，完整内容见 Markdown</span>;
}

function ReadingValueSection({ label, reason }: { label: ReadWorthLabel; reason?: string }) {
  return (
    <Section title="阅读价值判断">
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <ReadWorthVerdict label={label} />
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">
          {line(reason, '该判断综合信息完整度、证据强度、叙事倾向性和待核验问题得出。')}
        </div>
      </div>
    </Section>
  );
}

function ScoresSection({ report, quick = false }: { report: QuickAnalysisResult | DeepAnalysisResult; quick?: boolean }) {
  const rows = quick
    ? [
        ['信息完整度', report.scores.informationCompleteness, '原文关键信息够不够'],
        ['证据强度', report.scores.evidenceStrength, '原文证据硬不硬'],
        ['叙事倾向性', report.scores.narrativeBias, '原文是否明显单向引导'],
      ]
    : [
        ['可信度', report.scores.credibility, '越高表示越可信'],
        ['信息完整度', report.scores.informationCompleteness, '越高表示信息越完整'],
        ['叙事倾向性', report.scores.narrativeBias, '越高表示引导性越强'],
        ['证据强度', report.scores.evidenceStrength, '越高表示证据越充分'],
        ['推测不确定性', report.scores.speculationRisk, '越高表示越需要谨慎核验'],
      ];

  return (
    <Section title="核心指数" aside={<span className="text-xxs font-semibold text-gray-400">评分不等于判断新闻真假</span>}>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([name, value, help]) => (
          <div key={String(name)} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
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

function mdCell(value: unknown) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, '<br>').trim() || '暂无';
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
  if (!online?.enabled) {
    return ['## 13. 联网核验依据', '', '本次未启用联网核验。', ''];
  }

  const rows = [
    ...online.verifiedSources.map((item) => ['已核验来源', item.title, item.url, statusLabel(item.verificationStatus), `证据 ${item.evidenceGrade}`, item.relevance || item.note]),
    ...online.backgroundSources.map((item) => ['相关背景来源', item.title, item.url, statusLabel(item.verificationStatus), `证据 ${item.evidenceGrade}`, item.relevance || item.note]),
    ...online.pendingLeads.map((item) => ['待核验线索', item.title, item.url, statusLabel(item.verificationStatus), `证据 ${item.evidenceGrade}`, item.relevance || item.note]),
  ];

  return [
    '## 13. 联网核验依据',
    '',
    `联网状态：${online.status === 'has_results' ? '已找到可用来源' : online.status === 'no_reliable_sources' ? '未找到可靠来源' : '未启用'}`,
    '',
    ...(rows.length
      ? markdownTable(['分类', '来源标题', '链接', '核验状态', '证据等级', '可支持或限制的判断'], rows)
      : ['未找到可用于外部核验的可靠来源。']),
    '',
    '### 暂无法核验的信息',
    '',
    ...bullets(online.unableToConfirm || []),
    '',
  ];
}

function markdownFor(report: QuickAnalysisResult | DeepAnalysisResult, originalContent?: string, qaMessages: ChatMessage[] = []) {
  const meta = report.meta;
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
    ...report.verificationRoadmap.map((item) => `- **${item.question}**：材料类型 ${item.materialType}；优先级 ${item.priority}；重要性：${item.whyItMatters}`),
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

function QuickReportView({ report, originalContent, qaMessages }: { report: QuickAnalysisResult; originalContent?: string; qaMessages: ChatMessage[] }) {
  const questions = limitedItems(report.questionsToAsk, 3);
  return (
    <>
      <Section title="1. 原文速读"><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.originalReading || report.newsSummary}</p></Section>
      <Section title="2. 核心主张"><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.coreClaim}</p></Section>
      <ReadingValueSection label={report.readingValue} reason={report.readingValueReason} />
      <Section title="4. 一句话观隅审视"><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.oneSentenceJudgment}</p></Section>
      <Section title="5. 三个关键信号">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {[
            ['最可信信息', report.quickSignals?.mostCredibleInfo],
            ['最大信息缺口', report.quickSignals?.biggestGap],
            ['最需警惕叙事', report.quickSignals?.narrativeToWatch],
          ].map(([title, content]) => (
            <article key={title} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
              <div className="font-black text-gray-950 dark:text-white">{title}</div>
              <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{line(content)}</p>
            </article>
          ))}
        </div>
      </Section>
      <ScoresSection report={report} quick />
      <Section title="7. 最值得追问的 3 个问题">
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">{questions.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{item}</li>)}</ul>
      </Section>
      <Section title="8. 快速结论"><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.quickConclusion}</p></Section>
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} />
    </>
  );
}

function DeepReportView({ report, originalContent, qaMessages, displayLimit }: { report: DeepAnalysisResult; originalContent?: string; qaMessages: ChatMessage[]; displayLimit: number }) {
  const keyFindings = limitedItems(report.keyFindings, displayLimit);
  const supportingEvidence = limitedItems(report.supportingEvidence, displayLimit);
  const informationGaps = limitedItems(report.informationGaps, displayLimit);
  const stakeholderRelations = limitedItems(report.stakeholderRelations, displayLimit);
  const alternativeExplanations = limitedItems(report.alternativeExplanations, displayLimit);
  const verificationRoadmap = limitedItems(report.verificationRoadmap, displayLimit);
  const questions = limitedItems(report.questionsToAsk, displayLimit);
  return (
    <>
      <Section title="1. 原文解读">
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900 md:col-span-2">
            <div className="font-black text-gray-950 dark:text-white">原文在讲什么</div>
            <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{report.sourceInterpretation.whatItSays || report.newsSummary}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">核心主张</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.coreClaims.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">主要主体</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.mainActors.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">原文关键证据</div><ul className="mt-1 space-y-1">{report.sourceInterpretation.keyEvidence.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900"><div className="font-black">叙事方式</div><p className="mt-1 leading-relaxed">{report.sourceInterpretation.narrativeStyle}</p></div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900 md:col-span-2"><div className="font-black">读者最可能带走的印象</div><p className="mt-1 leading-relaxed">{report.sourceInterpretation.likelyReaderImpression}</p></div>
        </div>
      </Section>
      <ReadingValueSection label={report.readingValue} reason={report.readingValueReason} />
      <Section title="3. 给普通读者的读法"><p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.normalReaderGuide}</p></Section>
      <Section title="4. 一句话观隅审视"><p className="text-sm font-bold leading-relaxed text-gray-900 dark:text-white">{report.oneSentenceConclusion}</p></Section>
      <ScoresSection report={report} />
      <AuditCharts {...chartProps(report)} />
      <Section title="6. 结论分层">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            ['可以确认', report.conclusionLayers.confirmed],
            ['可以合理怀疑', report.conclusionLayers.reasonableDoubts],
            ['暂不能判断', report.conclusionLayers.cannotJudgeYet],
          ].map(([title, items]) => (
            <div key={String(title)} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
              <div className="font-black text-gray-950 dark:text-white">{String(title)}</div>
              <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">{(items as string[]).map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section title="7. 最关键的 3 个发现" aside={compactAside(report.keyFindings.length, displayLimit)}><div className="grid grid-cols-1 gap-3 lg:grid-cols-3">{keyFindings.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}</div></Section>
      <Section title="8. 支持原文叙事的证据" aside={compactAside(report.supportingEvidence.length, displayLimit) || <span className="text-xxs font-semibold text-gray-400">避免只唱反调</span>}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{supportingEvidence.map((item, index) => <JudgmentCard key={`${item.content}-${index}`} item={{ title: item.supportsNarrative, content: item.content, evidenceGrade: item.evidenceGrade, verificationStatus: item.verificationStatus, nextVerification: item.limitation }} />)}</div>
      </Section>
      <Section title="9. 主要信息缺口" aside={compactAside(report.informationGaps.length, displayLimit)}><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{informationGaps.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}</div></Section>
      <Section title="10. 关键利益关系" aside={compactAside(report.stakeholderRelations.length, displayLimit)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {stakeholderRelations.map((item, index) => <JudgmentCard key={`${item.role}-${index}`} item={{ title: item.role, content: `可能利益：${item.possibleBenefit || '原文未披露，需进一步核验。'}；可能代价：${item.possibleCost || '原文未披露，需进一步核验。'}`, judgmentType: item.judgmentType, speculationRisk: item.speculationRisk, nextVerification: item.pendingVerification, verificationStatus: 'pending_verification', evidenceGrade: 'D' }} />)}
        </div>
      </Section>
      <Section title="11. 替代解释对照" aside={compactAside(report.alternativeExplanations.length, displayLimit)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{alternativeExplanations.map((item, index) => <JudgmentCard key={`${item.explanation}-${index}`} item={{ title: item.explanation, content: `合理性：${item.reasonableness}；当前证据：${item.currentEvidenceStatus}`, speculationRisk: item.speculationRisk, nextVerification: item.neededVerification, verificationStatus: 'pending_verification', evidenceGrade: item.speculationRisk === '高' ? 'E' : 'D' }} />)}</div>
      </Section>
      <Section title="12. 证据与核验状态">
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
      <Section title="13. 验证路线图" aside={compactAside(report.verificationRoadmap.length, displayLimit)}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{verificationRoadmap.map((item, index) => <article key={`${item.question}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900"><div className="font-bold text-gray-950 dark:text-white">{item.question}</div><p className="mt-1 text-gray-600 dark:text-gray-300">{item.whyItMatters}</p><div className="mt-2 flex gap-1.5"><Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">{item.materialType}</Badge><Badge className={riskClass(item.priority)}>优先级 {item.priority}</Badge></div></article>)}</div>
      </Section>
      <Section title="联网核验结果"><WebVerificationView report={report} /></Section>
      <Section title="14. 继续追问清单" aside={compactAside(report.questionsToAsk.length, displayLimit)}><ul className="grid grid-cols-1 gap-2 md:grid-cols-2">{questions.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-700 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-300">{item}</li>)}</ul></Section>
      <Section title="15. 目前不能直接得出的结论"><ul className="space-y-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">{report.cannotConclude.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">- {item}</li>)}</ul></Section>
      <Section title="16. 风险提示"><p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">{report.riskNotice}</p></Section>
      <Section title="17. 报告元信息">
        <div className="grid gap-2 text-xs md:grid-cols-2">
          {[
            ['新闻标题', report.meta.title],
            ['新闻来源', report.meta.source],
            ['发布时间', report.meta.publishedAt || '未能可靠识别发布时间'],
            ['使用模型', report.meta.modelName],
            ['思考强度', report.meta.reasoningDepth],
            ['分析模式', report.meta.analysisMode],
            ['生成时间', report.meta.createdAt],
            ['方法论', report.methodology],
          ].map(([key, value]) => <div key={key} className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900"><span className="font-bold text-gray-500">{key}：</span>{value}</div>)}
        </div>
      </Section>
      <OriginalContentPanel originalContent={originalContent} />
      <DownloadButton report={report} originalContent={originalContent} qaMessages={qaMessages} />
    </>
  );
}

export default function AnalysisResultView({ result: rawResult, auditId, originalContent, auditMeta }: AnalysisResultProps) {
  const result = useNormalizedResult(rawResult, auditMeta);
  const [qaMessages, setQaMessages] = useState<ChatMessage[]>([]);
  const readWorth = result.read_worth || computeReadWorth(result);
  const { theme, readingLimit, showReadingGuide } = useAudienceTheme();

  return (
    <GsapReveal className="space-y-4 sm:space-y-5" y={18} stagger={0.055}>
      {showReadingGuide && <AudienceReadingGuide theme={theme} />}

      {isQuick(result)
        ? <QuickReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} qaMessages={qaMessages} />
        : <DeepReportView report={{ ...result, readingValue: readWorth.label, read_worth: readWorth }} originalContent={originalContent} qaMessages={qaMessages} displayLimit={readingLimit} />}

      {auditId && <InteractiveQA auditId={auditId} messages={qaMessages} onMessagesChange={setQaMessages} />}
    </GsapReveal>
  );
}

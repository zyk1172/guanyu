'use client';

import React, { useState } from 'react';
import { AnalysisResult, EvidenceGrade, SpeculationRisk, VerificationStatus } from '../lib/types';
import AuditCharts from './AuditCharts';
import { GsapReveal } from './GsapMotion';
import InteractiveQA, { ChatMessage } from './InteractiveQA';
import { computeReadWorth } from '../lib/readWorth';
import ReadWorthVerdict from './ReadWorthVerdict';

interface AnalysisResultProps {
  result: AnalysisResult;
  auditId?: string;
  originalContent?: string;
  auditMeta?: {
    title?: string;
    source?: string;
    publishedAt?: string;
    modelName?: string;
    reasoningDepth?: string;
    analysisMode?: string;
    createdAt?: string;
    viewCount?: number;
    isPublic?: boolean;
  };
}

const EVIDENCE_DEFINITIONS: Record<EvidenceGrade, string> = {
  A: '原始文件、官方数据、法院文书、财报、政策原文',
  B: '多方独立报道、公开数据库、专业机构报告',
  C: '单一媒体报道、机构通稿、当事方说法',
  D: '基于原文缺口的合理推断',
  E: '高推测、缺乏直接证据、仅作为待验证假设',
};

function normalizeDisplayCopy<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/审计/g, '审视').replace(/审查/g, '审视') as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDisplayCopy(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeDisplayCopy(item)])
    ) as T;
  }
  return value;
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
  if (status === '已核验') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300';
  if (status === '部分核验') return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/30 dark:bg-cyan-950/20 dark:text-cyan-300';
  if (status === '暂无法确认') return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300';
  return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/30 dark:bg-orange-950/20 dark:text-orange-300';
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xxs font-bold ${className}`}>
      {children}
    </span>
  );
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

function JudgmentCard({ item }: { item: any }) {
  return (
    <article className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
      <div className="font-bold leading-relaxed text-gray-950 dark:text-white">{item.title}</div>
      <p className="mt-1 leading-relaxed text-gray-600 dark:text-gray-300">{item.detail}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">
          {item.judgment_type || '基于原文的合理推断'}
        </Badge>
        <Badge className={evidenceClass(item.evidence_grade || item.evidence_strength)}>
          证据 {item.evidence_grade || item.evidence_strength || 'D'}
        </Badge>
        <Badge className={statusClass(item.verification_status)}>
          {item.verification_status || '待验证'}
        </Badge>
        <Badge className={riskClass(item.speculation_risk)}>
          风险 {item.speculation_risk || '中'}
        </Badge>
      </div>
      {item.verification_method && (
        <p className="mt-2 text-xxs font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
          验证路径：{item.verification_method}
        </p>
      )}
    </article>
  );
}

function line(value: unknown) {
  return value === undefined || value === null || value === '' ? '未提供' : String(value);
}

function bullets(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ['- 暂无'];
}

function judgmentMarkdown(item: any) {
  return [
    `- **${line(item.title || item.claim || item.expression || item.actor || item.evidence || item.target || item.explanation)}**`,
    item.detail ? `  - 内容：${item.detail}` : '',
    item.claim_type ? `  - 主张类型：${item.claim_type}` : '',
    item.evidence_source ? `  - 证据来源：${item.evidence_source}` : '',
    item.category ? `  - 语言分类：${item.category}` : '',
    item.effect ? `  - 影响：${item.effect}` : '',
    item.role ? `  - 角色：${item.role}` : '',
    item.possible_interest_or_cost ? `  - 可能利益或代价：${item.possible_interest_or_cost}` : '',
    item.grade_reason ? `  - 等级理由：${item.grade_reason}` : '',
    item.possible_issue ? `  - 可能问题：${item.possible_issue}` : '',
    item.issue_explanation ? `  - 问题说明：${item.issue_explanation}` : '',
    item.reasonableness ? `  - 合理性：${item.reasonableness}` : '',
    item.material_type ? `  - 材料类型：${item.material_type}` : '',
    item.why_needed ? `  - 为什么需要：${item.why_needed}` : '',
    item.how_to_verify ? `  - 如何验证：${item.how_to_verify}` : '',
    item.priority ? `  - 优先级：${item.priority}` : '',
    item.judgment_type ? `  - 判断类型：${item.judgment_type}` : '',
    item.evidence_grade || item.evidence_strength || item.grade ? `  - 证据等级：${item.evidence_grade || item.evidence_strength || item.grade}` : '',
    item.verification_status ? `  - 核验状态：${item.verification_status}` : '',
    item.speculation_risk ? `  - 推测风险：${item.speculation_risk}` : '',
    item.verification_method ? `  - 下一步验证：${item.verification_method}` : '',
  ].filter(Boolean).join('\n');
}

function sourceMarkdown(source: any) {
  return [
    `- **${line(source.title)}**`,
    source.url ? `  - 链接：${source.url}` : '',
    source.source_type ? `  - 来源类型：${source.source_type}` : '',
    source.relevance ? `  - 相关性：${source.relevance}` : '',
    source.verification_status ? `  - 核验状态：${source.verification_status}` : '',
    source.evidence_grade ? `  - 证据等级：${source.evidence_grade}` : '',
    source.note ? `  - 说明：${source.note}` : '',
  ].filter(Boolean).join('\n');
}

export default function AnalysisResultView({ result: rawResult, auditId, originalContent, auditMeta }: AnalysisResultProps) {
  const result = normalizeDisplayCopy(rawResult);
  const [qaMessages, setQaMessages] = useState<ChatMessage[]>([]);
  const readWorth = result.read_worth || computeReadWorth(result);
  const scoreSummary = result.score_summary || {
    credibility_score: 70,
    information_completeness_score: 70,
    narrative_bias_score: 40,
    evidence_strength_score: 70,
    speculation_risk_score: 30,
    score_reasoning: {
      credibility_score: '默认评估理由',
      information_completeness_score: '默认评估理由',
      narrative_bias_score: '默认评估理由',
      evidence_strength_score: '默认评估理由',
      speculation_risk_score: '默认评估理由',
    },
  };

  const nineMirror = result.nine_mirror_review;
  const keyFindings = result.key_findings?.length
    ? result.key_findings
    : [{
        title: '表层叙事与待核验缺口并存',
        detail: result.one_sentence_conclusion || '需要结合原文、九镜模块和外部材料进一步核验。',
        judgment_type: '基于原文的合理推断',
        evidence_grade: 'D',
        verification_status: '待验证',
        speculation_risk: '中',
        verification_method: '结合原文、原始材料和多方报道继续核验。',
      }];
  const supportingEvidence = result.narrative_supporting_evidence?.length
    ? result.narrative_supporting_evidence
    : (nineMirror?.atomic_claims || []).filter((item) => item.claim_type === '事实陈述').slice(0, 4).map((item) => ({
        title: '原文明确事实',
        detail: item.claim,
        original_basis: item.evidence_source || item.claim,
        judgment_type: '原文明确事实',
        evidence_grade: item.evidence_strength,
        verification_status: item.verification_status || '部分核验',
        speculation_risk: '低',
        verification_method: item.verification_method || '回到原文和原始出处核验。',
      }));
  const informationGaps = result.major_information_gaps?.length
    ? result.major_information_gaps
    : (nineMirror?.missing_perspective_matrix || []).filter((item) => item.status !== '已呈现').slice(0, 5).map((item) => ({
        title: `${item.perspective_type}信息不足`,
        detail: item.why_it_matters,
        missing_information: item.perspective_type,
        why_it_matters: item.why_it_matters,
        judgment_type: item.judgment_type || '基于原文的合理推断',
        evidence_grade: item.evidence_strength,
        verification_status: item.verification_status || '待验证',
        speculation_risk: item.speculation_risk,
        verification_method: item.verification_method,
      }));

  const downloadText = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const toMarkdownReport = () => {
    const web = result.web_verification;
    const nine = result.nine_mirror_review;
    return [
      '# 观隅 · 新闻叙事审视报告',
      '',
      '## 报告元信息',
      `- 新闻标题：${line(auditMeta?.title)}`,
      `- 新闻来源：${line(auditMeta?.source)}`,
      `- 发布时间：${line(auditMeta?.publishedAt)}`,
      `- 使用模型：${line(auditMeta?.modelName)}`,
      `- 思考强度：${line(auditMeta?.reasoningDepth)}`,
      `- 分析模式：${line(auditMeta?.analysisMode)}`,
      `- 生成时间：${line(auditMeta?.createdAt)}`,
      `- 点击数：${line(auditMeta?.viewCount)}`,
      `- 公开状态：${auditMeta?.isPublic === undefined ? '未提供' : auditMeta.isPublic ? '公开展示' : '仅自己可见'}`,
      `- 方法论：${line(result.report_meta?.methodology || nine?.methodology_name)}`,
      `- 生成范围：${line(result.report_meta?.generated_scope)}`,
      `- 评分说明：${line(result.report_meta?.scoring_note)}`,
      `- 是否值得读：${readWorth.label}`,
      '',
      '## 新闻原文',
      originalContent?.trim() || '未提供原文。',
      '',
      '## 新闻简要总结',
      result.news_summary || '暂无。',
      '',
      '## 一句话审视结论',
      result.one_sentence_conclusion || '暂无。',
      '',
      '## 核心指数',
      `- 可信度：${scoreSummary.credibility_score}`,
      `- 信息完整度：${scoreSummary.information_completeness_score}`,
      `- 叙事倾向性：${scoreSummary.narrative_bias_score}`,
      `- 证据强度：${scoreSummary.evidence_strength_score}`,
      `- 推测风险：${scoreSummary.speculation_risk_score}`,
      '',
      '### 评分理由',
      `- 可信度：${line(scoreSummary.score_reasoning?.credibility_score)}`,
      `- 信息完整度：${line(scoreSummary.score_reasoning?.information_completeness_score)}`,
      `- 叙事倾向性：${line(scoreSummary.score_reasoning?.narrative_bias_score)}`,
      `- 证据强度：${line(scoreSummary.score_reasoning?.evidence_strength_score)}`,
      `- 推测风险：${line(scoreSummary.score_reasoning?.speculation_risk_score)}`,
      '',
      '## 最关键的 3 个发现',
      ...(keyFindings.length ? keyFindings.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '## 支持原文叙事的证据',
      ...(supportingEvidence.length ? supportingEvidence.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '## 主要信息缺口',
      ...(informationGaps.length ? informationGaps.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '## 观隅九镜审读法',
      '',
      '### 1. 原子主张拆解',
      ...(nine?.atomic_claims?.length ? nine.atomic_claims.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '### 2. 叙事框架分析',
      `- 问题定义：${line(nine?.narrative_frame_analysis?.problem_definition)}`,
      `- 责任归因：${line(nine?.narrative_frame_analysis?.responsibility_attribution)}`,
      `- 道德立场：${line(nine?.narrative_frame_analysis?.moral_position)}`,
      `- 暗示方案：${line(nine?.narrative_frame_analysis?.implied_solution)}`,
      `- 判断类型：${line(nine?.narrative_frame_analysis?.judgment_type)}`,
      `- 证据等级：${line(nine?.narrative_frame_analysis?.evidence_strength)}`,
      `- 核验状态：${line(nine?.narrative_frame_analysis?.verification_status)}`,
      `- 推测风险：${line(nine?.narrative_frame_analysis?.speculation_risk)}`,
      `- 下一步验证：${line(nine?.narrative_frame_analysis?.verification_method)}`,
      '',
      '### 3. 语言框架审视',
      ...(nine?.language_frame_audit?.length ? nine.language_frame_audit.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '### 4. 缺席视角矩阵',
      ...(nine?.missing_perspective_matrix?.length ? nine.missing_perspective_matrix.map((item) => judgmentMarkdown({
        ...item,
        title: `${item.perspective_type}：${item.status}`,
        detail: item.why_it_matters,
      })) : ['- 暂无']),
      '',
      '### 5. 利益—代价地图',
      ...(nine?.interest_cost_map?.length ? nine.interest_cost_map.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '### 6. 证据阶梯评级',
      ...(nine?.evidence_ladder?.length ? nine.evidence_ladder.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '### 7. 因果链审视',
      ...(nine?.causal_chain_audit?.length ? nine.causal_chain_audit.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '### 8. 替代解释对照',
      ...(nine?.alternative_explanation_comparison?.length ? nine.alternative_explanation_comparison.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '### 9. 验证路线图',
      ...(nine?.verification_roadmap?.length ? nine.verification_roadmap.map(judgmentMarkdown) : ['- 暂无']),
      '',
      '## 联网核验结果',
      '',
      '### 已核验来源',
      ...(web?.verified_sources?.length ? web.verified_sources.map(sourceMarkdown) : ['- 暂无']),
      '',
      '### 相关背景来源',
      ...(web?.background_sources?.length ? web.background_sources.map(sourceMarkdown) : ['- 暂无']),
      '',
      '### 待核验线索',
      ...(web?.leads_to_verify?.length ? web.leads_to_verify.map(sourceMarkdown) : ['- 暂无']),
      '',
      '### 暂无法确认的信息',
      ...bullets(web?.unconfirmed_items || []),
      '',
      '## 继续追问清单',
      ...bullets(result.questions_to_ask_next || []),
      '',
      '## 交互式追问记录',
      ...(qaMessages.length
        ? qaMessages.map((message, index) => `### ${index + 1}. ${message.role === 'user' ? '我的问题' : '审视助手回答'}\n\n${message.content}`)
        : ['暂无交互式追问记录。']),
      '',
      '## 风险提示',
      '该内容属于推测性分析，请结合更多来源验证，不应直接视为事实。本报告不替用户断言所谓隐藏真相，只帮助识别新闻叙事结构、证据缺口、缺席视角和待验证问题。',
    ].join('\n');
  };

  return (
    <GsapReveal className="space-y-4 sm:space-y-5" y={18} stagger={0.055}>
      <div data-gsap-reveal className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-850 dark:border-amber-900/30 dark:bg-amber-950/15 dark:text-amber-300">
        风险提示：本报告审视的是报道结构、证据状态和待核验问题，不直接判断新闻真假，也不把推测视为事实。
      </div>

      <div data-gsap-reveal>
        <ReadWorthVerdict label={readWorth.label} />
      </div>

      <div data-gsap-reveal className="flex flex-wrap justify-end gap-2">
        <button onClick={() => downloadText('guanyu-review.md', toMarkdownReport(), 'text/markdown;charset=utf-8')} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300">
          导出完整 Markdown
        </button>
      </div>

      <section data-gsap-reveal className="result-summary rounded-xl border border-indigo-800/30 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 p-4 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="text-xxs font-black uppercase tracking-[0.18em] text-indigo-200">Guanyu Narrative Review</div>
            <h2 className="text-lg font-black leading-tight">观隅 · 新闻叙事审视报告</h2>
            <p className="max-w-3xl text-sm font-semibold leading-relaxed text-indigo-50">“{result.one_sentence_conclusion}”</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xxs leading-relaxed text-indigo-100 md:max-w-xs">
            {result.report_meta?.scoring_note || '评分用于衡量报道结构与证据状态，不等同于判断新闻真假。'}
          </div>
        </div>
      </section>

      <Section title="新闻简要总结">
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{result.news_summary}</p>
      </Section>

      <AuditCharts
        credibilityScore={scoreSummary.credibility_score}
        completenessScore={scoreSummary.information_completeness_score}
        biasScore={scoreSummary.narrative_bias_score}
        evidenceScore={scoreSummary.evidence_strength_score}
        riskScore={scoreSummary.speculation_risk_score}
        beneficiariesCount={nineMirror?.interest_cost_map?.filter((item) => item.role === '受益者').length || 0}
        costBearersCount={nineMirror?.interest_cost_map?.filter((item) => item.role === '成本承担者').length || 0}
        missingPerspectivesCount={nineMirror?.missing_perspective_matrix?.filter((item) => item.status !== '已呈现').length || 0}
        alternativeExplanationsCount={nineMirror?.alternative_explanation_comparison?.length || 0}
        evidenceGrades={nineMirror?.evidence_ladder?.map((item) => item.grade) || []}
        missingPerspectiveStatuses={nineMirror?.missing_perspective_matrix?.map((item) => item.status) || []}
        interestCostItems={nineMirror?.interest_cost_map || []}
      />

      <Section title="最关键的 3 个发现">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {keyFindings.slice(0, 3).map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}
        </div>
      </Section>

      <Section title="支持原文叙事的证据" aside={<span className="text-xxs font-semibold text-gray-400">避免只唱反调</span>}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {supportingEvidence.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}
        </div>
      </Section>

      <Section title="主要信息缺口">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {informationGaps.map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)}
        </div>
      </Section>

      {nineMirror && (
        <Section title="观隅九镜审读法" aside={<span className="text-xxs font-semibold text-gray-400">九个模块统一承载叙事、缺口、利益和替代解释</span>}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
                <h4 className="text-xs font-black text-gray-900 dark:text-white">1. 原子主张拆解</h4>
                <div className="mt-2 space-y-2">
                  {nineMirror.atomic_claims.slice(0, 8).map((item, index) => (
                    <JudgmentCard key={`${item.claim}-${index}`} item={{
                      title: item.claim,
                      detail: `类型：${item.claim_type}；来源：${item.evidence_source}`,
                      judgment_type: item.judgment_type,
                      evidence_grade: item.evidence_strength,
                      verification_status: item.verification_status,
                      speculation_risk: item.speculation_risk,
                      verification_method: item.verification_method,
                    }} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-850 dark:bg-gray-900">
                <h4 className="text-xs font-black text-gray-900 dark:text-white">2. 叙事框架分析</h4>
                <div className="mt-2 space-y-2 leading-relaxed text-gray-600 dark:text-gray-300">
                  <p><span className="font-bold text-gray-950 dark:text-white">问题定义：</span>{nineMirror.narrative_frame_analysis.problem_definition}</p>
                  <p><span className="font-bold text-gray-950 dark:text-white">责任归因：</span>{nineMirror.narrative_frame_analysis.responsibility_attribution}</p>
                  <p><span className="font-bold text-gray-950 dark:text-white">道德立场：</span>{nineMirror.narrative_frame_analysis.moral_position}</p>
                  <p><span className="font-bold text-gray-950 dark:text-white">暗示方案：</span>{nineMirror.narrative_frame_analysis.implied_solution}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <MirrorList title="3. 语言框架审视" items={nineMirror.language_frame_audit.map((item) => ({
                title: `${item.expression} / ${item.category}`,
                detail: item.effect,
                evidence_grade: item.evidence_strength,
                verification_status: item.verification_status,
                speculation_risk: item.speculation_risk,
                verification_method: item.verification_method,
              }))} />
              <MirrorList title="4. 缺席视角矩阵" items={nineMirror.missing_perspective_matrix.map((item) => ({
                title: `${item.perspective_type}：${item.status}`,
                detail: item.why_it_matters,
                evidence_grade: item.evidence_strength,
                verification_status: item.verification_status,
                speculation_risk: item.speculation_risk,
                verification_method: item.verification_method,
              }))} />
              <MirrorList title="5. 利益—代价地图" items={nineMirror.interest_cost_map.map((item) => ({
                title: `${item.actor} / ${item.role}`,
                detail: item.possible_interest_or_cost,
                evidence_grade: item.evidence_strength,
                verification_status: item.verification_status,
                speculation_risk: item.speculation_risk,
                verification_method: item.verification_method,
              }))} />
              <MirrorList title="6. 证据阶梯评级" items={nineMirror.evidence_ladder.map((item) => ({
                title: `${item.grade} 级证据`,
                detail: `${item.evidence}；${item.grade_reason}`,
                evidence_grade: item.grade,
                verification_status: item.grade === 'A' || item.grade === 'B' ? '部分核验' : '待验证',
                speculation_risk: item.grade === 'E' ? '高' : item.grade === 'D' ? '中' : '低',
                verification_method: item.verification_method,
              }))} />
              <MirrorList title="7. 因果链审视" items={nineMirror.causal_chain_audit.map((item) => ({
                title: item.causal_claim,
                detail: `${item.possible_issue}：${item.issue_explanation}`,
                evidence_grade: item.evidence_strength,
                verification_status: item.verification_status,
                speculation_risk: item.speculation_risk,
                verification_method: item.verification_method,
              }))} />
              <MirrorList title="8. 替代解释对照" items={nineMirror.alternative_explanation_comparison.map((item) => ({
                title: item.explanation,
                detail: `合理性：${item.reasonableness}`,
                judgment_type: item.judgment_type,
                evidence_grade: item.evidence_strength,
                verification_status: item.verification_status,
                speculation_risk: item.speculation_risk,
                verification_method: item.verification_method,
              }))} />
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
              <h4 className="text-xs font-black text-gray-900 dark:text-white">9. 验证路线图</h4>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                {nineMirror.verification_roadmap.map((item, index) => (
                  <article key={`${item.target}-${index}`} className="rounded-lg border border-gray-100 bg-white p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
                    <div className="font-bold text-gray-950 dark:text-white">{item.target}</div>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">{item.why_needed}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/30 dark:bg-indigo-950/20 dark:text-indigo-300">{item.material_type}</Badge>
                      <Badge className={riskClass(item.priority === '高' ? '高' : item.priority === '低' ? '低' : '中')}>优先级 {item.priority}</Badge>
                    </div>
                    <p className="mt-2 text-xxs font-semibold text-gray-500 dark:text-gray-400">方法：{item.how_to_verify}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title="联网核验结果" aside={<span className="text-xxs font-semibold text-gray-400">不展示搜索 query 残留</span>}>
        <WebVerificationView result={result} />
      </Section>

      <Section title="风险提示">
        <div className="space-y-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          <p>本报告不替用户断言所谓隐藏真相，只帮助识别新闻叙事结构、证据缺口、缺席视角和待验证问题。</p>
          <p>凡涉及债务风险、财政兜底、政策考核、政治收益、利益输送、连带责任等敏感判断，除非有 A/B 级材料直接支持，都应视为待验证假设。</p>
        </div>
      </Section>

      {auditId && (
        <InteractiveQA
          auditId={auditId}
          messages={qaMessages}
          onMessagesChange={setQaMessages}
        />
      )}
    </GsapReveal>
  );
}

function MirrorList({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
      <h4 className="text-xs font-black text-gray-900 dark:text-white">{title}</h4>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="rounded border border-dashed border-gray-200 p-3 text-xs text-gray-400 dark:border-gray-800">暂无可展示条目。</p>
        ) : (
          items.slice(0, 8).map((item, index) => <JudgmentCard key={`${item.title}-${index}`} item={item} />)
        )}
      </div>
    </div>
  );
}

function WebVerificationView({ result }: { result: AnalysisResult }) {
  const web = result.web_verification;
  const groups = [
    { title: '已核验来源', items: web?.verified_sources || [] },
    { title: '相关背景来源', items: web?.background_sources || [] },
    { title: '待核验线索', items: web?.leads_to_verify || [] },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
            <h4 className="text-xs font-black text-gray-900 dark:text-white">{group.title}</h4>
            <div className="mt-2 space-y-2">
              {group.items.length === 0 ? (
                <p className="text-xs text-gray-400">暂无。</p>
              ) : group.items.slice(0, 4).map((source, index) => (
                <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-100 bg-white p-2 text-xs transition hover:border-sky-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-sky-800">
                  <div className="line-clamp-2 font-bold text-gray-950 dark:text-white">{source.title}</div>
                  <p className="mt-1 line-clamp-2 text-gray-500 dark:text-gray-400">{source.relevance || source.note}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge className={statusClass(source.verification_status)}>{source.verification_status}</Badge>
                    <Badge className={evidenceClass(source.evidence_grade)}>证据 {source.evidence_grade}</Badge>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(web?.unconfirmed_items || []).length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
          <h4 className="text-xs font-black text-gray-900 dark:text-white">暂无法确认的信息</h4>
          <ul className="mt-2 space-y-1.5">
            {web?.unconfirmed_items.map((item, index) => (
              <li key={`${item}-${index}`} className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">- {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

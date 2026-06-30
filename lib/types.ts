export type AnalysisMode = 'quick' | 'deep';
export type ThinkingDepth = 'none' | 'low' | 'medium' | 'high' | 'extreme';

export const THINKING_DEPTH_LABELS: Record<ThinkingDepth, string> = {
  none: '无',
  low: '低',
  medium: '中',
  high: '高',
  extreme: '极高',
};

export const THINKING_DEPTH_OPTIONS: Array<{
  value: ThinkingDepth;
  label: string;
  description: string;
}> = [
  { value: 'none', label: '无', description: '不额外强化推敲，保持直接输出。' },
  { value: 'low', label: '低', description: '轻量核对关键判断，控制篇幅。' },
  { value: 'medium', label: '中', description: '标准审视强度，兼顾完整度和速度。' },
  { value: 'high', label: '高', description: '强化证据、利益结构和替代解释。' },
  { value: 'extreme', label: '极高', description: '最严格多维审视，成本和耗时最高。' },
];

export function getThinkingDepthLabel(depth: string): string {
  const labels: Record<string, string> = {
    ...THINKING_DEPTH_LABELS,
    quick: '低',
    standard: '中',
    deep: '高',
    exhaustive: '极高',
  };
  return labels[depth] || depth;
}

export function normalizeThinkingDepthValue(depth: string | null | undefined): ThinkingDepth {
  const legacyMap: Record<string, ThinkingDepth> = {
    quick: 'low',
    standard: 'medium',
    deep: 'high',
    exhaustive: 'extreme',
  };
  if (!depth) return 'medium';
  if (depth in THINKING_DEPTH_LABELS) return depth as ThinkingDepth;
  return legacyMap[depth] || 'medium';
}

export interface AnalysisRequest {
  title: string;
  source: string;
  date: string;
  content: string;
  focus?: string;
  mode: AnalysisMode;
}

export interface FramingWord {
  word: string;
  effect: string;
}

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type SpeculationRisk = '高' | '中' | '低';
export type VerificationStatusCode =
  | 'source_supported'
  | 'externally_verified'
  | 'partially_supported'
  | 'pending_verification'
  | 'unable_to_verify';
export type VerificationStatus = VerificationStatusCode | '已核验' | '部分核验' | '待验证' | '暂无法确认' | '原文支持';
export type JudgmentType = '原文明确事实' | '基于原文的合理推断' | '待外部验证的假设';
export type PublishedAtSource =
  | 'user_input'
  | 'json_ld'
  | 'meta_article'
  | 'meta_og'
  | 'meta_pubdate'
  | 'time_tag'
  | 'body_people_daily_format'
  | 'body_regex'
  | 'unknown';
export type PublishedAtConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface StructuredJudgment {
  title: string;
  detail: string;
  judgment_type: JudgmentType;
  evidence_grade: EvidenceGrade;
  verification_status: VerificationStatus;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface NarrativeSupportingEvidence extends StructuredJudgment {
  original_basis: string;
}

export interface InformationGap extends StructuredJudgment {
  missing_information: string;
  why_it_matters: string;
}

export interface WebVerificationSource {
  title: string;
  url: string;
  source_type: string;
  relevance: string;
  verification_status: VerificationStatus;
  evidence_grade: EvidenceGrade;
  note: string;
}

export interface WebVerification {
  verified_sources: WebVerificationSource[];
  background_sources: WebVerificationSource[];
  leads_to_verify: WebVerificationSource[];
  unconfirmed_items: string[];
}

export interface ReportMeta {
  report_title: '观隅 · 新闻叙事审视报告';
  methodology: '观隅九镜审读法';
  generated_scope: string;
  scoring_note: string;
}

export type ReadWorthLabel = '值得细读' | '可以略读' | '不值一读' | '暂无法判断';

export interface ReadWorthVerdict {
  label: ReadWorthLabel;
  score: number;
  factors: {
    credibility: number;
    informationCompleteness: number;
    narrativeBias: number;
    evidenceStrength: number;
    speculationRisk: number;
    evidenceGradeScore: number;
    weakEvidenceCount: number;
    strongEvidenceCount: number;
    missingPerspectivePenalty: number;
    unconfirmedItemCount: number;
  };
}

export interface ReportScores {
  credibility: number;
  informationCompleteness: number;
  narrativeBias: number;
  evidenceStrength: number;
  speculationRisk: number;
}

export interface NormalizedReportMeta {
  title: string;
  source: string;
  publishedAt: string;
  publishedAtSource: PublishedAtSource;
  publishedAtConfidence: PublishedAtConfidence;
  modelName: string;
  reasoningDepth: string;
  analysisMode: AnalysisMode;
  createdAt: string;
  viewCount?: number;
  isPublic?: boolean;
}

export interface ReportJudgment {
  title: string;
  content: string;
  judgmentType: JudgmentType;
  evidenceGrade: EvidenceGrade;
  verificationStatus: VerificationStatusCode;
  speculationRisk: SpeculationRisk;
  nextVerification: string;
}

export interface SupportingEvidenceItem {
  content: string;
  supportsNarrative: string;
  evidenceGrade: EvidenceGrade;
  verificationStatus: VerificationStatusCode;
  limitation: string;
}

export interface InformationGapItem {
  title: string;
  description: string;
  whyItMatters: string;
  currentEvidenceGrade: EvidenceGrade;
  verificationStatus: VerificationStatusCode;
  nextVerification: string;
}

export interface StakeholderRelationItem {
  role: string;
  possibleBenefit: string;
  possibleCost: string;
  judgmentType: JudgmentType;
  speculationRisk: SpeculationRisk;
  pendingVerification: string;
}

export interface AlternativeExplanationItem {
  explanation: string;
  reasonableness: '高' | '中' | '低';
  currentEvidenceStatus: string;
  speculationRisk: SpeculationRisk;
  neededVerification: string;
}

export interface EvidenceVerificationSummary {
  strongestEvidence: string;
  weakestEvidence: string;
  sourceSupportedClaims: string[];
  externallyVerifiedClaims: string[];
  pendingVerificationClaims: string[];
  unableToVerifyClaims: string[];
}

export interface VerificationRoadmapTask {
  question: string;
  materialType: '原始文件' | '数据' | '专家意见' | '当事方回应' | '多源报道' | '法律法规' | '行业标准';
  whyItMatters: string;
  priority: '高' | '中' | '低';
}

export interface OnlineVerificationSource {
  title: string;
  url: string;
  sourceType: string;
  relevance: string;
  verificationStatus: VerificationStatusCode;
  evidenceGrade: EvidenceGrade;
  note: string;
}

export interface OnlineVerification {
  enabled: boolean;
  status: 'not_enabled' | 'no_reliable_sources' | 'has_results';
  verifiedSources: OnlineVerificationSource[];
  backgroundSources: OnlineVerificationSource[];
  pendingLeads: OnlineVerificationSource[];
  unableToConfirm: string[];
}

export interface QuickAnalysisResult {
  reportType: 'quick';
  methodology: '观隅九镜审读法';
  meta: NormalizedReportMeta;
  newsSummary: string;
  oneSentenceJudgment: string;
  readingValue: ReadWorthLabel;
  read_worth?: ReadWorthVerdict;
  scores: ReportScores;
  mainNarrativeIssues: ReportJudgment[];
  mainInformationGaps: InformationGapItem[];
  questionsToAsk: string[];
  riskNotice: string;
}

export interface DeepAnalysisResult {
  reportType: 'deep';
  methodology: '观隅九镜审读法';
  meta: NormalizedReportMeta;
  generationScope: string;
  scoreExplanation: string;
  newsSummary: string;
  oneSentenceConclusion: string;
  readingValue: ReadWorthLabel;
  read_worth?: ReadWorthVerdict;
  scores: ReportScores;
  scoreReasons: Record<keyof ReportScores, string>;
  keyFindings: ReportJudgment[];
  supportingEvidence: SupportingEvidenceItem[];
  informationGaps: InformationGapItem[];
  stakeholderRelations: StakeholderRelationItem[];
  alternativeExplanations: AlternativeExplanationItem[];
  evidenceVerificationSummary: EvidenceVerificationSummary;
  verificationRoadmap: VerificationRoadmapTask[];
  questionsToAsk: string[];
  onlineVerification: OnlineVerification;
  riskNotice: string;
}

export interface MissingPerspective {
  perspective: string;
  why_it_matters: string;
}

export interface Beneficiary {
  actor: string;
  reason: string;
  confidence: '高' | '中' | '低';
  confidence_percent?: number;
}

export interface CostBearer {
  actor: string;
  reason: string;
  confidence: '高' | '中' | '低';
  confidence_percent?: number;
}

export interface AlternativeExplanation {
  explanation: string;
  reasonableness: '高' | '中' | '低';
  current_evidence: '充分' | '有限' | '不足';
  speculation_risk: '高' | '中' | '低';
  confidence_percent?: number;
  needed_evidence: string[];
}

export interface FactCheckSource {
  title: string;
  url: string;
  snippet: string;
}

export interface DeepSearchGroup {
  topic: string;
  query: string;
  sources: FactCheckSource[];
}

export interface CredibilityAssessment {
  information_completeness: '高' | '中' | '低';
  narrative_bias: '高' | '中' | '低';
  evidence_strength: '高' | '中' | '低';
  obvious_blind_spots: '是' | '否' | '不确定';
}

export interface ScoreReasoning {
  credibility_score: string;
  information_completeness_score: string;
  narrative_bias_score: string;
  evidence_strength_score: string;
  speculation_risk_score: string;
}

export interface ScoreSummary {
  credibility_score: number;
  information_completeness_score: number;
  narrative_bias_score: number;
  evidence_strength_score: number;
  speculation_risk_score: number;
  score_reasoning: ScoreReasoning;
}

export interface AtomicClaim {
  claim: string;
  claim_type: '事实陈述' | '因果判断' | '价值判断' | '政策主张' | '预测判断' | '归责判断';
  evidence_source: string;
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface NarrativeFrameAnalysis {
  problem_definition: string;
  responsibility_attribution: string;
  moral_position: string;
  implied_solution: string;
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface LanguageFrameItem {
  expression: string;
  category: '情绪词' | '合法性词' | '模糊主体' | '被动语态' | '责任淡化' | '数字包装' | '标签化表达' | '政策修辞' | '治理隐喻' | '道德化修辞' | '救助叙事';
  effect: string;
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface MissingPerspectiveMatrixItem {
  perspective_type: '直接受影响者' | '弱势承担者' | '基层执行者' | '反对者' | '独立专家' | '历史案例' | '原始数据';
  status: '缺席' | '弱呈现' | '已呈现';
  why_it_matters: string;
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface InterestCostMapItem {
  actor: string;
  role: '决策者' | '受益者' | '成本承担者' | '沉默者' | '中介者';
  possible_interest_or_cost: string;
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface EvidenceLadderItem {
  evidence: string;
  grade: EvidenceGrade;
  grade_reason: string;
  verification_method: string;
}

export interface CausalChainAuditItem {
  causal_claim: string;
  possible_issue: '相关性冒充因果性' | '样本偏差' | '缺少基准数据' | '缺少对照组' | '统计口径变化' | '其他';
  issue_explanation: string;
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface AlternativeExplanationComparisonItem {
  explanation: string;
  reasonableness: '高' | '中' | '低';
  judgment_type?: JudgmentType;
  verification_status?: VerificationStatus;
  evidence_strength: EvidenceGrade;
  speculation_risk: SpeculationRisk;
  verification_method: string;
}

export interface VerificationRoadmapItem {
  target: string;
  material_type: '原始材料' | '数据' | '采访对象' | '对比报道' | '历史案例';
  why_needed: string;
  how_to_verify: string;
  priority: '高' | '中' | '低';
}

export interface NineMirrorReview {
  methodology_name: '观隅九镜审读法';
  atomic_claims: AtomicClaim[];
  narrative_frame_analysis: NarrativeFrameAnalysis;
  language_frame_audit: LanguageFrameItem[];
  missing_perspective_matrix: MissingPerspectiveMatrixItem[];
  interest_cost_map: InterestCostMapItem[];
  evidence_ladder: EvidenceLadderItem[];
  causal_chain_audit: CausalChainAuditItem[];
  alternative_explanation_comparison: AlternativeExplanationComparisonItem[];
  verification_roadmap: VerificationRoadmapItem[];
}

export interface LegacyAnalysisResult {
  report_meta?: ReportMeta;
  read_worth?: ReadWorthVerdict;
  news_summary: string;
  key_findings?: StructuredJudgment[];
  narrative_supporting_evidence?: NarrativeSupportingEvidence[];
  major_information_gaps?: InformationGap[];
  web_verification?: WebVerification;
  score_summary: ScoreSummary;
  fact_check_sources?: FactCheckSource[];
  deep_search_sources?: DeepSearchGroup[];
  nine_mirror_review?: NineMirrorReview;
  questions_to_ask_next: string[];
  one_sentence_conclusion: string;
}

export type AnalysisResult = QuickAnalysisResult | DeepAnalysisResult | LegacyAnalysisResult;

export const MODE_LABELS: Record<AnalysisMode, string> = {
  quick: '快速分析',
  deep: '深度分析',
};

export const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  quick: '快速扫描叙事框架和关键盲区',
  deep: '强化联网核对、评分依据、利益结构、缺席视角和替代解释',
};

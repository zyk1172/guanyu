export type AnalysisMode = 'quick' | 'deep';
export type ThinkingDepth = 'none' | 'low' | 'medium' | 'high' | 'extreme';
export type ReportLanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR' | 'de-DE' | 'it-IT';
export type AudienceTheme = 'teen' | 'youth' | 'mature' | 'senior';

export const REPORT_LANGUAGE_OPTIONS: Array<{
  value: ReportLanguage;
  label: string;
  description: string;
}> = [
  { value: 'zh-CN', label: '中文', description: '报告正文、摘要和追问使用中文输出。' },
  { value: 'zh-TW', label: '繁體中文', description: '報告正文、摘要和追問使用繁體中文輸出。' },
  { value: 'en-US', label: 'English', description: 'Report narrative, summaries, and follow-up answers are generated in English.' },
  { value: 'ja-JP', label: '日本語', description: 'レポート、要約、追問を日本語で生成します。' },
  { value: 'ko-KR', label: '한국어', description: '보고서, 요약 및 후속 질문을 한국어로 생성합니다.' },
  { value: 'de-DE', label: 'Deutsch', description: 'Bericht, Zusammenfassung und Nachfragen werden auf Deutsch erstellt.' },
  { value: 'it-IT', label: 'Italiano', description: 'Rapporto, sintesi e domande di approfondimento sono generati in italiano.' },
];

export function normalizeReportLanguage(value: string | null | undefined): ReportLanguage {
  const normalized = String(value || '').trim();
  const aliases: Record<string, ReportLanguage> = {
    'zh-CN': 'zh-CN', zh: 'zh-CN', chinese: 'zh-CN', 'simplified-chinese': 'zh-CN',
    'zh-TW': 'zh-TW', 'zh-Hant': 'zh-TW', traditional: 'zh-TW', 'traditional-chinese': 'zh-TW',
    'en-US': 'en-US', en: 'en-US', english: 'en-US',
    'ja-JP': 'ja-JP', ja: 'ja-JP', japanese: 'ja-JP',
    'ko-KR': 'ko-KR', ko: 'ko-KR', korean: 'ko-KR',
    'de-DE': 'de-DE', de: 'de-DE', german: 'de-DE', deutsch: 'de-DE',
    'it-IT': 'it-IT', it: 'it-IT', italian: 'it-IT', italiano: 'it-IT',
  };
  return aliases[normalized] || 'zh-CN';
}

export function getReportLanguageLabel(value: string | null | undefined, uiLanguage?: string | null): string {
  const language = normalizeReportLanguage(value);
  const labels: Record<ReportLanguage, string> = {
    'zh-CN': normalizeReportLanguage(uiLanguage) === 'en-US' ? 'Simplified Chinese' : '中文',
    'zh-TW': '繁體中文',
    'en-US': 'English',
    'ja-JP': '日本語',
    'ko-KR': '한국어',
    'de-DE': 'Deutsch',
    'it-IT': 'Italiano',
  };
  return labels[language];
}

export function getReadWorthDisplayLabel(label: ReadWorthLabel, language: string | null | undefined): string {
  const labels: Record<ReportLanguage, Record<ReadWorthLabel, string>> = {
    'zh-CN': { 深度阅读: '深度阅读', 概览阅读: '概览阅读', 有限参考: '有限参考', 材料不足: '材料不足' },
    'zh-TW': { 深度阅读: '深度閱讀', 概览阅读: '概覽閱讀', 有限参考: '有限參考', 材料不足: '材料不足' },
    'en-US': { 深度阅读: 'In-depth Reading', 概览阅读: 'Overview Reading', 有限参考: 'Limited Reference', 材料不足: 'Insufficient Material' },
    'ja-JP': { 深度阅读: '精読向け', 概览阅读: '概要把握', 有限参考: '限定参考', 材料不足: '資料不足' },
    'ko-KR': { 深度阅读: '심층 읽기', 概览阅读: '개요 읽기', 有限参考: '제한적 참고', 材料不足: '자료 부족' },
    'de-DE': { 深度阅读: 'Vertiefende Lektüre', 概览阅读: 'Überblickslektüre', 有限参考: 'Begrenzter Referenzwert', 材料不足: 'Unzureichende Grundlage' },
    'it-IT': { 深度阅读: 'Lettura approfondita', 概览阅读: 'Lettura d’insieme', 有限参考: 'Riferimento limitato', 材料不足: 'Materiale insufficiente' },
  };
  return labels[normalizeReportLanguage(language)][label];
}

export function getReadWorthEvidenceGuidance(posture: ReadWorthEvidencePosture, language: string | null | undefined) {
  const copy: Record<ReportLanguage, Record<ReadWorthEvidencePosture, { label: string; guidance: string }>> = {
    'zh-CN': {
      fact_reference: { label: '事实参考', guidance: '当前证据基础较稳，可将主要事实作为参考，仍建议核对关键原始来源。' },
      cautious_reading: { label: '审慎阅读', guidance: '内容具有阅读收益，但部分关键主张仍需结合原始材料或独立来源理解。' },
      lead_reference: { label: '线索参考', guidance: '内容可用于了解议题与线索，不宜把关键主张直接视为已证实事实。' },
      insufficient_material: { label: '材料不足', guidance: '现有材料不足以形成稳定的阅读收益和证据判断。' },
    },
    'zh-TW': {
      fact_reference: { label: '事實參考', guidance: '目前證據基礎較穩，可將主要事實作為參考，仍建議核對關鍵原始來源。' },
      cautious_reading: { label: '審慎閱讀', guidance: '內容具有閱讀收益，但部分關鍵主張仍需結合原始材料或獨立來源理解。' },
      lead_reference: { label: '線索參考', guidance: '內容可用於了解議題與線索，不宜把關鍵主張直接視為已證實事實。' },
      insufficient_material: { label: '材料不足', guidance: '現有材料不足以形成穩定的閱讀收益與證據判斷。' },
    },
    'en-US': {
      fact_reference: { label: 'Factual reference', guidance: 'The evidence base is relatively stable. Key facts may be used as reference, while primary sources should still be checked.' },
      cautious_reading: { label: 'Cautious reading', guidance: 'The article offers reading value, but some key claims still require primary or independent sources.' },
      lead_reference: { label: 'Lead material', guidance: 'Use the article to understand the issue and identify leads, not as confirmation of its key claims.' },
      insufficient_material: { label: 'Insufficient material', guidance: 'The available material is insufficient for a stable reading-value or evidence assessment.' },
    },
    'ja-JP': {
      fact_reference: { label: '事実参照', guidance: '証拠基盤は比較的安定しています。主要事実は参照できますが、一次資料の確認を推奨します。' },
      cautious_reading: { label: '慎重読解', guidance: '読む意義はありますが、一部の主要主張は一次資料や独立情報源との照合が必要です。' },
      lead_reference: { label: '手掛かり', guidance: '論点や手掛かりの把握に用い、主要主張を確認済み事実として扱わないでください。' },
      insufficient_material: { label: '資料不足', guidance: '安定した読解価値と証拠評価を行うための資料が不足しています。' },
    },
    'ko-KR': {
      fact_reference: { label: '사실 참고', guidance: '근거 기반이 비교적 안정적입니다. 주요 사실은 참고할 수 있으나 핵심 원자료 확인을 권합니다.' },
      cautious_reading: { label: '신중 검토', guidance: '읽을 가치는 있지만 일부 핵심 주장은 원자료나 독립 출처와 함께 검토해야 합니다.' },
      lead_reference: { label: '단서 참고', guidance: '쟁점과 단서를 파악하는 용도로 사용하고 핵심 주장을 확인된 사실로 보지 마십시오.' },
      insufficient_material: { label: '자료 부족', guidance: '안정적인 읽기 가치 및 근거 판단을 내리기에는 자료가 부족합니다.' },
    },
    'de-DE': {
      fact_reference: { label: 'Faktenbasis', guidance: 'Die Beleglage ist relativ stabil. Kernaussagen können als Referenz dienen; Primärquellen sollten dennoch geprüft werden.' },
      cautious_reading: { label: 'Vorsichtige Lektüre', guidance: 'Der Beitrag bietet Informationswert, doch zentrale Aussagen benötigen Primär- oder unabhängige Quellen.' },
      lead_reference: { label: 'Hinweismaterial', guidance: 'Der Beitrag eignet sich zur Orientierung und Spurensuche, nicht als Bestätigung zentraler Aussagen.' },
      insufficient_material: { label: 'Grundlage unzureichend', guidance: 'Das Material reicht für eine stabile Bewertung von Lektürewert und Beleglage nicht aus.' },
    },
    'it-IT': {
      fact_reference: { label: 'Riferimento fattuale', guidance: 'La base probatoria e relativamente stabile. I fatti principali sono utilizzabili come riferimento, verificando comunque le fonti primarie.' },
      cautious_reading: { label: 'Lettura prudente', guidance: 'Il contenuto offre valore informativo, ma alcune affermazioni richiedono fonti primarie o indipendenti.' },
      lead_reference: { label: 'Fonte orientativa', guidance: 'Usa il contenuto per orientarti e individuare piste, non come conferma delle affermazioni principali.' },
      insufficient_material: { label: 'Materiale insufficiente', guidance: 'Il materiale non basta per una valutazione stabile del valore di lettura e delle prove.' },
    },
  };
  return copy[normalizeReportLanguage(language)][posture];
}

export const AUDIENCE_THEME_LABELS: Record<AudienceTheme, string> = {
  teen: '青少年版',
  youth: '青年版',
  mature: '成熟版',
  senior: '长者版',
};

export const AUDIENCE_THEME_DESCRIPTIONS: Record<AudienceTheme, string> = {
  teen: '更明亮，术语解释更直接，优先展示关键内容。',
  youth: '默认专业风格，信息密度较高，适合高频使用。',
  mature: '更克制，强调证据、核验状态和阅读节奏。',
  senior: '更大字号、更高对比度、更少动效和更少可见卡片。',
};

export function normalizeAudienceThemeValue(value: string | null | undefined): AudienceTheme {
  if (value === 'teen' || value === 'mature' || value === 'senior') return value;
  return 'youth';
}

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

export function getThinkingDepthLabel(depth: string, uiLanguage?: string | null): string {
  const language = normalizeReportLanguage(uiLanguage);
  const labelsByLanguage: Record<ReportLanguage, Record<string, string>> = {
    'zh-CN': {
      ...THINKING_DEPTH_LABELS,
      quick: '低', standard: '中', deep: '高', exhaustive: '极高',
    },
    'zh-TW': {
      none: '無', low: '低', medium: '中', high: '高', extreme: '極高',
      quick: '低', standard: '中', deep: '高', exhaustive: '極高',
    },
    'en-US': {
      none: 'None',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      extreme: 'Very high',
      quick: 'Low',
      standard: 'Medium',
      deep: 'High',
      exhaustive: 'Very high',
    },
    'ja-JP': {
      none: 'なし', low: '低', medium: '中', high: '高', extreme: '最高',
      quick: '低', standard: '中', deep: '高', exhaustive: '最高',
    },
    'ko-KR': {
      none: '없음', low: '낮음', medium: '중간', high: '높음', extreme: '매우 높음',
      quick: '낮음', standard: '중간', deep: '높음', exhaustive: '매우 높음',
    },
    'de-DE': {
      none: 'Keine', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', extreme: 'Sehr hoch',
      quick: 'Niedrig', standard: 'Mittel', deep: 'Hoch', exhaustive: 'Sehr hoch',
    },
    'it-IT': {
      none: 'Nessuna', low: 'Bassa', medium: 'Media', high: 'Alta', extreme: 'Molto alta',
      quick: 'Bassa', standard: 'Media', deep: 'Alta', exhaustive: 'Molto alta',
    },
  };
  return labelsByLanguage[language][depth] || depth;
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
  | 'ai_assessed'
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

export type ReadWorthLabel = '深度阅读' | '概览阅读' | '有限参考' | '材料不足';
export type ReadWorthEvidencePosture = 'fact_reference' | 'cautious_reading' | 'lead_reference' | 'insufficient_material';

export interface ReadingUtilityFactors {
  publicImportance: number;
  informationGain: number;
  uniqueness: number;
  explanatoryDepth: number;
  actionability: number;
  informationDensity: number;
}

export interface ReadWorthVerdict {
  label: ReadWorthLabel;
  score: number;
  evidencePosture: ReadWorthEvidencePosture;
  factors: ReadingUtilityFactors | null;
}

export interface ReportScores {
  credibility: number;
  informationCompleteness: number;
  narrativeBias: number;
  evidenceStrength: number;
  speculationRisk: number;
}

export interface TimeAssessment {
  publishedAt: string;
  basis: string;
  confidence: PublishedAtConfidence;
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
  reportLanguage: ReportLanguage;
  createdAt: string;
  viewCount?: number;
  isPublic?: boolean;
  timeAssessment?: TimeAssessment;
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

export type ManualVerificationOutcome = 'verified' | 'unverified';

export interface ManualVerificationRecord {
  index: number;
  question: string;
  outcome: ManualVerificationOutcome;
  updatedAt: string;
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
  originalReading: string;
  coreClaim: string;
  newsSummary: string;
  oneSentenceJudgment: string;
  readingValue: ReadWorthLabel;
  readingValueReason: string;
  readingUtility: ReadingUtilityFactors;
  read_worth?: ReadWorthVerdict;
  scores: ReportScores;
  quickSignals: {
    mostCredibleInfo: string;
    biggestGap: string;
    narrativeToWatch: string;
  };
  mainNarrativeIssues: ReportJudgment[];
  mainInformationGaps: InformationGapItem[];
  questionsToAsk: string[];
  quickConclusion: string;
  riskNotice: string;
}

export interface DeepAnalysisResult {
  reportType: 'deep';
  methodology: '观隅九镜审读法';
  meta: NormalizedReportMeta;
  generationScope: string;
  scoreExplanation: string;
  sourceInterpretation: {
    whatItSays: string;
    coreClaims: string[];
    mainActors: string[];
    keyEvidence: string[];
    narrativeStyle: string;
    likelyReaderImpression: string;
  };
  newsSummary: string;
  oneSentenceConclusion: string;
  readingValue: ReadWorthLabel;
  readingValueReason: string;
  readingUtility: ReadingUtilityFactors;
  read_worth?: ReadWorthVerdict;
  scores: ReportScores;
  scoreReasons: Record<keyof ReportScores, string>;
  normalReaderGuide: string;
  conclusionLayers: {
    confirmed: string[];
    reasonableDoubts: string[];
    cannotJudgeYet: string[];
  };
  keyFindings: ReportJudgment[];
  supportingEvidence: SupportingEvidenceItem[];
  informationGaps: InformationGapItem[];
  stakeholderRelations: StakeholderRelationItem[];
  alternativeExplanations: AlternativeExplanationItem[];
  evidenceVerificationSummary: EvidenceVerificationSummary;
  verificationRoadmap: VerificationRoadmapTask[];
  manualVerifications?: ManualVerificationRecord[];
  manualVerificationBaseline?: ReportScores;
  manualVerificationNotes?: string[];
  readingValueBaseReason?: string;
  readingValueVerificationReason?: string;
  questionsToAsk: string[];
  cannotConclude: string[];
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
  quick: '历史快速分析',
  deep: '观隅分析',
};

export const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  quick: '旧版快速报告，仅用于历史记录兼容',
  deep: '完整联网核对、评分依据、利益结构、缺席视角和替代解释',
};

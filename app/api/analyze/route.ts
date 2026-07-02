import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildCompactFallbackPrompt, buildPrompt } from '@/lib/prompts';
import { computeReadWorth } from '@/lib/readWorth';
import { searchWeb, WebSearchOptions } from '@/lib/search';
import { decryptSecret } from '@/lib/secret';
import { assertAnalyzeRateLimit, recordAnalyzeEvent } from '@/lib/rate-limit';
import { buildUsagePlan, commitUsage, getOrCreateAppSetting } from '@/lib/billing';
import type { UsageSource } from '@/lib/billing';
import type {
  AnalysisMode,
  AnalysisResult,
  EvidenceGrade,
  PublishedAtConfidence,
  ReportScores,
  SpeculationRisk,
  VerificationStatusCode,
  JudgmentType,
} from '@/lib/types';

export const maxDuration = 300;

const MAX_NEWS_CONTENT_LENGTH = 30000;
const VALID_ANALYSIS_MODES = new Set(['quick', 'deep']);
const VALID_THINKING_DEPTHS = new Set(['none', 'low', 'medium', 'high', 'extreme', 'quick', 'standard', 'deep', 'exhaustive']);

function normalizeThinkingDepth(depth?: string | null) {
  if (!depth || !VALID_THINKING_DEPTHS.has(depth)) return 'medium';
  const legacyMap: Record<string, string> = {
    quick: 'low',
    standard: 'medium',
    deep: 'high',
    exhaustive: 'extreme',
  };
  return legacyMap[depth] || depth;
}

function clampScore(score: unknown, defaultVal = 50): number {
  const val = Number.parseInt(String(score), 10);
  if (Number.isNaN(val)) return defaultVal;
  return Math.min(Math.max(val, 0), 100);
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function cleanTitle(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  if (!text || text === '未提供' || text === '暂无') return fallback;
  return text;
}

function normalizeEvidenceGrade(value: unknown): EvidenceGrade {
  return ['A', 'B', 'C', 'D', 'E'].includes(String(value)) ? String(value) as EvidenceGrade : 'D';
}

function normalizeRisk(value: unknown): SpeculationRisk {
  return value === '高' || value === '低' ? value : '中';
}

function normalizeVerificationStatus(value: unknown, hasExternalResults: boolean): VerificationStatusCode {
  const raw = String(value || '').trim();
  if (raw === 'externally_verified') return hasExternalResults ? 'externally_verified' : 'source_supported';
  if (raw === 'source_supported' || raw === 'partially_supported' || raw === 'pending_verification' || raw === 'unable_to_verify') return raw;
  if (raw === '已核验' || raw === '原文支持') return hasExternalResults ? 'externally_verified' : 'source_supported';
  if (raw === '部分核验' || raw === '部分支持') return 'partially_supported';
  if (raw === '暂无法确认') return 'unable_to_verify';
  return 'pending_verification';
}

function normalizePublishedAt(value: unknown): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const cnMatch = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnMatch) {
    const [, year, month, day] = cnMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return '';
}

function normalizePublishedAtConfidence(value: unknown): PublishedAtConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'unknown';
}

function normalizeJudgmentType(value: unknown): JudgmentType {
  if (value === '原文明确事实' || value === '待外部验证的假设') return value;
  return '基于原文的合理推断';
}

function stringArray(value: unknown, fallback: string[] = []) {
  const items = asArray<string>(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function getScores(parsed: any): ReportScores {
  const src = parsed?.scores || parsed?.score_summary || {};
  return {
    credibility: clampScore(src.credibility ?? src.credibility_score, 70),
    informationCompleteness: clampScore(src.informationCompleteness ?? src.information_completeness_score, 60),
    narrativeBias: clampScore(src.narrativeBias ?? src.narrative_bias_score, 45),
    evidenceStrength: clampScore(src.evidenceStrength ?? src.evidence_strength_score, 60),
    speculationRisk: clampScore(src.speculationRisk ?? src.speculation_risk_score, 45),
  };
}

function normalizeJudgment(item: any, fallbackTitle: string, hasExternalResults: boolean) {
  return {
    title: cleanTitle(item?.title || item?.claim || item?.expression, fallbackTitle),
    content: String(item?.content || item?.detail || item?.reason || item?.why_it_matters || '当前材料不足，无法形成可靠判断。'),
    judgmentType: normalizeJudgmentType(item?.judgmentType || item?.judgment_type),
    evidenceGrade: normalizeEvidenceGrade(item?.evidenceGrade || item?.evidence_grade || item?.evidence_strength || item?.grade),
    verificationStatus: normalizeVerificationStatus(item?.verificationStatus || item?.verification_status, hasExternalResults),
    speculationRisk: normalizeRisk(item?.speculationRisk || item?.speculation_risk),
    nextVerification: String(item?.nextVerification || item?.verification_method || '寻找原始材料、公开数据、多方报道或当事方回应进行核验。'),
  };
}

function normalizeGap(item: any, fallbackTitle: string, hasExternalResults: boolean) {
  return {
    title: cleanTitle(item?.title || item?.missing_information, fallbackTitle),
    description: String(item?.description || item?.detail || item?.missing_information || '原文未披露但影响判断的关键信息。'),
    whyItMatters: String(item?.whyItMatters || item?.why_it_matters || '该信息会影响对报道完整性和因果链条的判断。'),
    currentEvidenceGrade: normalizeEvidenceGrade(item?.currentEvidenceGrade || item?.evidence_grade || item?.evidence_strength),
    verificationStatus: normalizeVerificationStatus(item?.verificationStatus || item?.verification_status, hasExternalResults),
    nextVerification: String(item?.nextVerification || item?.verification_method || '寻找原始材料、公开数据、多方报道或当事方回应进行核验。'),
  };
}

function normalizeOnlineVerification(parsed: any, factCheckSources: Awaited<ReturnType<typeof searchWeb>>) {
  const existing = parsed?.onlineVerification || parsed?.web_verification || {};
  const hasExternalResults = factCheckSources.length > 0;
  const sourceFromSearch = (source: any) => ({
    title: String(source?.title || '相关背景来源'),
    url: String(source?.url || ''),
    sourceType: String(source?.sourceType || source?.source_type || source?.provider || '相关来源'),
    relevance: String(source?.relevance || source?.snippet || '可作为背景核对方向。'),
    verificationStatus: normalizeVerificationStatus(source?.verificationStatus || source?.verification_status || 'partially_supported', true),
    evidenceGrade: normalizeEvidenceGrade(source?.evidenceGrade || source?.evidence_grade || 'C'),
    note: String(source?.note || `来自 ${source?.provider || '搜索服务'}；仅作为核对来源，不直接等同于事实结论。`),
  });

  if (!existing?.enabled && !hasExternalResults) {
    return {
      enabled: false,
      status: 'not_enabled' as const,
      verifiedSources: [],
      backgroundSources: [],
      pendingLeads: [],
      unableToConfirm: [],
    };
  }

  const verifiedSources = hasExternalResults
    ? asArray(existing.verifiedSources || existing.verified_sources).map(sourceFromSearch)
    : [];
  const backgroundSources = asArray(existing.backgroundSources || existing.background_sources).length > 0
    ? asArray(existing.backgroundSources || existing.background_sources).map(sourceFromSearch)
    : factCheckSources.slice(0, 5).map(sourceFromSearch);
  const pendingLeads = asArray(existing.pendingLeads || existing.leads_to_verify).map(sourceFromSearch);
  const unableToConfirm = asArray<string>(existing.unableToConfirm || existing.unconfirmed_items);
  const hasAnyResult = verifiedSources.length + backgroundSources.length + pendingLeads.length > 0;

  return {
    enabled: true,
    status: hasAnyResult ? 'has_results' as const : 'no_reliable_sources' as const,
    verifiedSources,
    backgroundSources,
    pendingLeads,
    unableToConfirm: unableToConfirm.length > 0 ? unableToConfirm : (hasAnyResult ? [] : ['未找到可用于外部核验的可靠来源。']),
  };
}

function normalizeReport(params: {
  parsed: any;
  mode: AnalysisMode;
  meta: any;
  factCheckSources: Awaited<ReturnType<typeof searchWeb>>;
}): AnalysisResult {
  const { parsed, mode, meta, factCheckSources } = params;
  const onlineVerification = normalizeOnlineVerification(parsed, factCheckSources);
  const hasExternalResults = onlineVerification.status === 'has_results';
  const scores = getScores(parsed);
  const timeAssessment = {
    publishedAt: normalizePublishedAt(parsed?.timeAssessment?.publishedAt || parsed?.time_assessment?.published_at),
    basis: String(parsed?.timeAssessment?.basis || parsed?.time_assessment?.basis || '模型未能给出可靠发布时间依据。'),
    confidence: normalizePublishedAtConfidence(parsed?.timeAssessment?.confidence || parsed?.time_assessment?.confidence),
  };
  const baseMeta = {
    title: meta.title,
    source: meta.source,
    publishedAt: timeAssessment.publishedAt,
    publishedAtSource: 'ai_assessed' as const,
    publishedAtConfidence: timeAssessment.confidence,
    modelName: meta.modelName,
    reasoningDepth: meta.reasoningDepth,
    analysisMode: mode,
    createdAt: meta.createdAt,
    viewCount: meta.viewCount,
    isPublic: meta.isPublic,
    timeAssessment,
  };

  if (mode === 'quick') {
    const report = {
      reportType: 'quick' as const,
      methodology: '观隅九镜审读法' as const,
      meta: baseMeta,
      originalReading: String(parsed.originalReading || parsed.original_reading || parsed.newsSummary || parsed.news_summary || '当前材料不足，无法形成可靠速读。'),
      coreClaim: String(parsed.coreClaim || parsed.core_claim || parsed.surface_narrative || '原文核心主张需要结合全文继续确认。'),
      newsSummary: String(parsed.newsSummary || parsed.news_summary || '当前材料不足，无法形成可靠摘要。'),
      oneSentenceJudgment: String(parsed.oneSentenceJudgment || parsed.one_sentence_conclusion || '需要结合更多来源核验报道中的关键信息缺口。'),
      readingValue: '暂无法判断' as const,
      readingValueReason: String(parsed.readingValueReason || parsed.reading_value_reason || '当前材料证据状态有限，阅读价值需要结合原文信息完整度和外部核验情况判断。'),
      scores,
      quickSignals: {
        mostCredibleInfo: String(parsed.quickSignals?.mostCredibleInfo || parsed.quick_signals?.most_credible_info || '原文明确出现、可直接定位到文本的事实信息相对更可信。'),
        biggestGap: String(parsed.quickSignals?.biggestGap || parsed.quick_signals?.biggest_gap || '原文缺少能支撑核心结论的关键数据或原始材料。'),
        narrativeToWatch: String(parsed.quickSignals?.narrativeToWatch || parsed.quick_signals?.narrative_to_watch || '需要警惕把表态、愿景或单方说法包装成已验证成效。'),
      },
      mainNarrativeIssues: asArray(parsed.mainNarrativeIssues || parsed.key_findings).slice(0, 3).map((item, index) =>
        normalizeJudgment(item, `主要叙事问题 ${index + 1}`, hasExternalResults)
      ),
      mainInformationGaps: asArray(parsed.mainInformationGaps || parsed.major_information_gaps).slice(0, 3).map((item, index) =>
        normalizeGap(item, `主要信息缺口 ${index + 1}`, hasExternalResults)
      ),
      questionsToAsk: asArray<string>(parsed.questionsToAsk || parsed.questions_to_ask_next).slice(0, 3),
      quickConclusion: String(parsed.quickConclusion || parsed.quick_conclusion || '可以先略读原文，重点核对核心数据、原始材料和当事方回应，不宜直接把报道中的成效判断视为已验证事实。'),
      riskNotice: String(parsed.riskNotice || '本报告的不确定性主要来自原文证据缺口、外部核验不足和推断链条限制；它影响读者对报道完整性、相关主体责任和后续行动的判断，应通过原始材料、多方报道和当事方回应继续核验。'),
    };
    const readWorth = computeReadWorth(report);
    return { ...report, readingValue: readWorth.label, read_worth: readWorth };
  }

  const report = {
    reportType: 'deep' as const,
    methodology: '观隅九镜审读法' as const,
    meta: baseMeta,
    generationScope: String(parsed.generationScope || parsed.report_meta?.generated_scope || '基于用户提供原文、账号配置和可用联网线索生成；不替用户断言新闻真假。'),
    scoreExplanation: String(parsed.scoreExplanation || parsed.report_meta?.scoring_note || '评分用于衡量报道结构与证据状态，不等同于判断新闻真假。可信度越高表示越可信，信息完整度越高表示信息越完整，叙事倾向性越高表示引导性越强，证据强度越高表示证据越充分，推测不确定性越高表示越需要补充核验。'),
    sourceInterpretation: {
      whatItSays: String(parsed.sourceInterpretation?.whatItSays || parsed.source_interpretation?.what_it_says || parsed.newsSummary || parsed.news_summary || '当前材料不足，无法形成可靠原文解读。'),
      coreClaims: stringArray(parsed.sourceInterpretation?.coreClaims || parsed.source_interpretation?.core_claims, [String(parsed.oneSentenceConclusion || parsed.one_sentence_conclusion || '原文核心主张需要结合全文继续确认。')]),
      mainActors: stringArray(parsed.sourceInterpretation?.mainActors || parsed.source_interpretation?.main_actors, ['原文涉及的主要主体需要结合正文继续识别。']),
      keyEvidence: stringArray(parsed.sourceInterpretation?.keyEvidence || parsed.source_interpretation?.key_evidence, ['当前材料不足，无法形成可靠证据归纳。']),
      narrativeStyle: String(parsed.sourceInterpretation?.narrativeStyle || parsed.source_interpretation?.narrative_style || '原文叙事方式需要结合措辞和材料来源继续判断。'),
      likelyReaderImpression: String(parsed.sourceInterpretation?.likelyReaderImpression || parsed.source_interpretation?.likely_reader_impression || '读者最可能带走的印象需要结合标题、摘要和重点段落判断。'),
    },
    newsSummary: String(parsed.newsSummary || parsed.news_summary || '当前材料不足，无法形成可靠摘要。'),
    oneSentenceConclusion: String(parsed.oneSentenceConclusion || parsed.one_sentence_conclusion || '需要结合更多来源核验报道中的关键信息缺口。'),
    readingValue: '暂无法判断' as const,
    readingValueReason: String(parsed.readingValueReason || parsed.reading_value_reason || '阅读价值由报道信息完整度、证据强度、叙事倾向性和待核验问题共同决定。'),
    scores,
    scoreReasons: {
      credibility: String(parsed.scoreReasons?.credibility || parsed.score_summary?.score_reasoning?.credibility_score || '当前材料不足，无法形成可靠判断。'),
      informationCompleteness: String(parsed.scoreReasons?.informationCompleteness || parsed.score_summary?.score_reasoning?.information_completeness_score || '当前材料不足，无法形成可靠判断。'),
      narrativeBias: String(parsed.scoreReasons?.narrativeBias || parsed.score_summary?.score_reasoning?.narrative_bias_score || '当前材料不足，无法形成可靠判断。'),
      evidenceStrength: String(parsed.scoreReasons?.evidenceStrength || parsed.score_summary?.score_reasoning?.evidence_strength_score || '当前材料不足，无法形成可靠判断。'),
      speculationRisk: String(parsed.scoreReasons?.speculationRisk || parsed.score_summary?.score_reasoning?.speculation_risk_score || '当前材料不足，无法形成可靠判断。'),
    },
    normalReaderGuide: String(parsed.normalReaderGuide || parsed.normal_reader_guide || '普通读者应先区分原文明确事实、合理推断和待验证假设；重点查看原始材料、关键数据和当事方回应，不要把报道叙事直接等同于事实全貌。'),
    conclusionLayers: {
      confirmed: stringArray(parsed.conclusionLayers?.confirmed || parsed.conclusion_layers?.confirmed, ['原文中明确出现的事实可以作为文本内信息理解，但仍不等于外部事实已核验。']),
      reasonableDoubts: stringArray(parsed.conclusionLayers?.reasonableDoubts || parsed.conclusion_layers?.reasonable_doubts, ['对原文未披露的关键数据、因果链条和利益关系可以保持合理怀疑。']),
      cannotJudgeYet: stringArray(parsed.conclusionLayers?.cannotJudgeYet || parsed.conclusion_layers?.cannot_judge_yet, ['缺少原始材料、多方来源或当事方回应前，不宜形成确定结论。']),
    },
    keyFindings: asArray(parsed.keyFindings || parsed.key_findings).slice(0, 3).map((item, index) =>
      normalizeJudgment(item, `关键发现 ${index + 1}`, hasExternalResults)
    ),
    supportingEvidence: asArray(parsed.supportingEvidence || parsed.narrative_supporting_evidence).map((item: any) => ({
      content: String(item?.content || item?.detail || '当前材料不足，无法形成可靠判断。'),
      supportsNarrative: String(item?.supportsNarrative || item?.original_basis || '支撑原文主要叙事。'),
      evidenceGrade: normalizeEvidenceGrade(item?.evidenceGrade || item?.evidence_grade),
      verificationStatus: normalizeVerificationStatus(item?.verificationStatus || item?.verification_status || 'source_supported', hasExternalResults),
      limitation: String(item?.limitation || item?.verification_method || '仍需核验原始材料或多方来源。'),
    })),
    informationGaps: asArray(parsed.informationGaps || parsed.major_information_gaps).map((item, index) =>
      normalizeGap(item, `主要信息缺口 ${index + 1}`, hasExternalResults)
    ),
    stakeholderRelations: asArray(parsed.stakeholderRelations).map((item: any) => ({
      role: String(item?.role || item?.actor || '相关主体'),
      possibleBenefit: String(item?.possibleBenefit || item?.possible_interest_or_cost || '原文未披露，需进一步核验。'),
      possibleCost: String(item?.possibleCost || '原文未披露，需进一步核验。'),
      judgmentType: normalizeJudgmentType(item?.judgmentType || item?.judgment_type),
      speculationRisk: normalizeRisk(item?.speculationRisk || item?.speculation_risk),
      pendingVerification: String(item?.pendingVerification || item?.verification_method || '核对资金、政策、职责边界、公开数据或当事方回应。'),
    })),
    alternativeExplanations: asArray(parsed.alternativeExplanations).slice(0, 4).map((item: any) => ({
      explanation: String(item?.explanation || '当前材料不足，无法形成可靠判断。'),
      reasonableness: item?.reasonableness === '高' || item?.reasonableness === '低' ? item.reasonableness : '中',
      currentEvidenceStatus: String(item?.currentEvidenceStatus || item?.current_evidence || '证据有限，需继续核验。'),
      speculationRisk: normalizeRisk(item?.speculationRisk || item?.speculation_risk),
      neededVerification: String(item?.neededVerification || item?.verification_method || '寻找原始材料、数据和对比报道验证该解释。'),
    })),
    evidenceVerificationSummary: {
      strongestEvidence: String(parsed.evidenceVerificationSummary?.strongestEvidence || '当前材料不足，无法形成可靠判断。'),
      weakestEvidence: String(parsed.evidenceVerificationSummary?.weakestEvidence || '当前材料不足，无法形成可靠判断。'),
      sourceSupportedClaims: asArray<string>(parsed.evidenceVerificationSummary?.sourceSupportedClaims),
      externallyVerifiedClaims: hasExternalResults ? asArray<string>(parsed.evidenceVerificationSummary?.externallyVerifiedClaims) : [],
      pendingVerificationClaims: asArray<string>(parsed.evidenceVerificationSummary?.pendingVerificationClaims),
      unableToVerifyClaims: asArray<string>(parsed.evidenceVerificationSummary?.unableToVerifyClaims),
    },
    verificationRoadmap: asArray(parsed.verificationRoadmap).slice(0, 6).map((item: any) => ({
      question: String(item?.question || item?.target || '需要继续验证的问题'),
      materialType: String(item?.materialType || item?.material_type || '多源报道') as any,
      whyItMatters: String(item?.whyItMatters || item?.why_needed || '该材料会影响对报道结构和证据状态的判断。'),
      priority: item?.priority === '高' || item?.priority === '低' ? item.priority : '中',
    })),
    questionsToAsk: asArray<string>(parsed.questionsToAsk || parsed.questions_to_ask_next).slice(0, 5),
    cannotConclude: stringArray(parsed.cannotConclude || parsed.cannot_conclude || parsed.evidenceVerificationSummary?.unableToVerifyClaims, ['不能据此直接判断报道结论完全成立，也不能据此推出相反事实。']),
    onlineVerification,
    riskNotice: String(parsed.riskNotice || '本报告的不确定性主要来自原文证据缺口、外部核验不足和推断链条限制；它影响读者对报道完整性、相关主体责任和后续行动的判断，应通过原始材料、多方报道和当事方回应继续核验。'),
  };
  const readWorth = computeReadWorth(report);
  return { ...report, readingValue: readWorth.label, read_worth: readWorth };
}

function buildSearchContext(sources: Awaited<ReturnType<typeof searchWeb>>): string {
  return sources
    .map((source, index) => `${index + 1}. ${source.title}\n搜索服务：${source.provider || 'unknown'}\n链接：${source.url}${source.snippet ? `\n依据摘录：${source.snippet}` : ''}\n核验使用要求：只能支持与该来源标题、链接和摘录直接相关的判断；无法直接支持的判断必须写“暂无法核验”。`)
    .join('\n\n');
}

function buildSearchOptions(params: {
  usageSource: UsageSource;
  userSettings: any;
  appSetting: any;
}): WebSearchOptions {
  const useOwnApi = params.usageSource === 'byok';
  const adminTavilyKey = params.appSetting?.adminTavilyApiKeyEncrypted
    ? decryptSecret(params.appSetting.adminTavilyApiKeyEncrypted)
    : (process.env.TAVILY_API_KEY || '');
  const adminSerperKey = params.appSetting?.adminSerperApiKeyEncrypted
    ? decryptSecret(params.appSetting.adminSerperApiKeyEncrypted)
    : (process.env.SERPER_API_KEY || '');
  const hasAdminTavily = Boolean(adminTavilyKey && (params.appSetting?.enableAdminTavilySearch || params.appSetting?.adminTavilyApiKeyEncrypted || process.env.TAVILY_API_KEY));
  const hasAdminSerper = Boolean(adminSerperKey && (params.appSetting?.enableAdminSerperSearch || params.appSetting?.adminSerperApiKeyEncrypted || process.env.SERPER_API_KEY));
  const tavilyApiKey = useOwnApi
    ? (params.userSettings?.enableTavilySearch && params.userSettings?.tavilyApiKeyEncrypted
        ? decryptSecret(params.userSettings.tavilyApiKeyEncrypted)
        : '')
    : (hasAdminTavily ? adminTavilyKey : '');
  const serperApiKey = useOwnApi
    ? (params.userSettings?.enableSerperSearch && params.userSettings?.serperApiKeyEncrypted
        ? decryptSecret(params.userSettings.serperApiKeyEncrypted)
        : '')
    : (hasAdminSerper ? adminSerperKey : '');
  const tavilySearchDepth = useOwnApi ? (params.userSettings?.tavilySearchDepth || 'basic') : 'basic';

  if (tavilyApiKey && serperApiKey) {
    return {
      provider: 'multi',
      tavilyApiKey,
      serperApiKey,
      tavilySearchDepth,
    };
  }
  if (tavilyApiKey) {
    return {
      provider: 'tavily',
      tavilyApiKey,
      tavilySearchDepth,
    };
  }
  if (serperApiKey) {
    return { provider: 'serper', serperApiKey };
  }
  return { provider: 'none' };
}

function chooseModelConfig(params: {
  usageSource: UsageSource;
  userSettings: any;
  appSetting: any;
}) {
  if (params.usageSource !== 'byok') {
    return {
      modelName: params.appSetting?.adminModelName || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
      baseURL: params.appSetting?.adminLlmBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: params.appSetting?.adminLlmApiKeyEncrypted
        ? decryptSecret(params.appSetting.adminLlmApiKeyEncrypted)
        : (process.env.OPENAI_API_KEY || ''),
    };
  }

  return {
    modelName: params.userSettings?.defaultModelName || '',
    baseURL: params.userSettings?.llmBaseUrl || '',
    apiKey: params.userSettings?.llmApiKeyEncrypted
      ? decryptSecret(params.userSettings.llmApiKeyEncrypted)
      : '',
  };
}

async function buildDeepSearchGroups(base: { title?: string; source?: string; content: string }, searchOptions: WebSearchOptions) {
  const core = [base.title, base.source].filter(Boolean).join(' ');
  const contentHint = base.content.slice(0, 180).replace(/\s+/g, ' ');
  const queries = [
    `${core} 原始材料 官方数据 政策 原文 ${contentHint}`,
    `${core} 多方报道 背景 数据 争议 ${contentHint}`,
    `${core} 相关主体 责任 利益 成本 ${contentHint}`,
  ];

  return Promise.all(queries.map(async (query) => searchWeb(query.slice(0, 260), 3, searchOptions)));
}

async function callChatCompletions(params: {
  baseURL: string;
  apiKey: string;
  modelName: string;
  system: string;
  userPrompt: string;
}) {
  const response = await fetch(`${params.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.modelName,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    return { ok: false as const, status: response.status, text, message: '' };
  }

  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return {
    ok: true as const,
    status: response.status,
    text,
    message: data?.choices?.[0]?.message?.content || '',
  };
}

function modelErrorMessage(status: number, usageSource: UsageSource) {
  const scope = usageSource === 'byok' ? '你的个人模型配置' : '管理员全局模型配置';
  if (status === 401 || status === 403) {
    return `${scope}的 API Key 无效、未生效或没有调用权限，请检查密钥是否完整、是否填入了正确账号，以及模型服务商是否已启用该 Key。`;
  }
  if (status === 404) {
    return `${scope}中的模型名称或接口地址不可用，请检查模型名和 Base URL。`;
  }
  if (status === 429) {
    return `${scope}触发了上游限流或额度不足，请稍后重试或更换可用额度。`;
  }
  if (status >= 500) {
    return `模型服务暂时不可用或上游通道异常，请稍后重试。`;
  }
  return `模型审视调用失败 (状态码 ${status})。`;
}

function parseAssistantJSON(assistantMessage: string) {
  let cleanText = assistantMessage.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.substring(7, cleanText.length - 3).trim();
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.substring(3, cleanText.length - 3).trim();
  }
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start >= 0 && end > start) cleanText = cleanText.slice(start, end + 1);
  return JSON.parse(cleanText);
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: '请登录后再创建新闻审视。' }, { status: 401 });
    }
    await assertAnalyzeRateLimit(currentUser.id);

    const [userSettings, appSetting] = await Promise.all([
      prisma.userSettings.findUnique({
        where: { userId: currentUser.id },
      }),
      getOrCreateAppSetting(),
    ]);

    const body = await request.json();
    const { title, source, content, focus, mode } = body;

    if (!content || content.trim().length < 50) {
      return NextResponse.json({ error: '新闻正文太短，最少需要 50 个字符。' }, { status: 400 });
    }

    const truncatedContent = content.slice(0, MAX_NEWS_CONTENT_LENGTH);
    const actualReasoningDepth = normalizeThinkingDepth(userSettings?.defaultReasoningDepth);
    const requestedMode = mode || userSettings?.defaultAnalysisMode || 'quick';
    const actualAnalysisMode = (VALID_ANALYSIS_MODES.has(requestedMode) ? requestedMode : 'quick') as AnalysisMode;
    const actualIsPublic = userSettings?.defaultIsPublic !== undefined ? userSettings.defaultIsPublic : true;
    const usagePlan = await buildUsagePlan(currentUser.id, actualAnalysisMode);
    const searchOptions = buildSearchOptions({ usageSource: usagePlan.source, userSettings, appSetting });

    const searchQuery = [title, source, truncatedContent.slice(0, 120)].filter(Boolean).join(' ').slice(0, 240);
    const factCheckSources = searchQuery ? await searchWeb(searchQuery, 5, searchOptions) : [];
    const deepSources = actualAnalysisMode === 'deep'
      ? (await buildDeepSearchGroups({ title, source, content: truncatedContent }, searchOptions)).flat()
      : [];
    const webSearchContext = buildSearchContext([...factCheckSources, ...deepSources]);

    const promptInput = {
      title: title || '未知标题',
      source: source || '未知来源',
      content: truncatedContent,
      focus,
      mode: actualAnalysisMode,
      reasoningDepth: actualReasoningDepth,
      webSearchContext,
    };
    const { system, user: userPrompt } = buildPrompt(promptInput);

    const modelConfig = chooseModelConfig({ usageSource: usagePlan.source, userSettings, appSetting });
    if (!modelConfig.apiKey || !modelConfig.modelName || !modelConfig.baseURL) {
      return NextResponse.json({
        error: usagePlan.source === 'byok'
          ? '买断账号需要先在账号管理中保存自己的大模型名称、接口地址和 API Key。'
          : usagePlan.source === 'free_admin'
          ? '管理员免费额度模型 API 未配置，请联系管理员。'
          : '管理员点数模型 API 未配置，请联系管理员。',
      }, { status: 500 });
    }

    let usedFallbackPrompt = false;
    let llmResult = await callChatCompletions({
      baseURL: modelConfig.baseURL,
      apiKey: modelConfig.apiKey,
      modelName: modelConfig.modelName,
      system,
      userPrompt,
    });

    if (!llmResult.ok && llmResult.status >= 500) {
      const fallbackPrompt = buildCompactFallbackPrompt(promptInput);
      usedFallbackPrompt = true;
      llmResult = await callChatCompletions({
        baseURL: modelConfig.baseURL,
        apiKey: modelConfig.apiKey,
        modelName: modelConfig.modelName,
        system: fallbackPrompt.system,
        userPrompt: fallbackPrompt.user,
      });
    }

    if (!llmResult.ok) {
      console.error('LLM API error:', llmResult.text);
      return NextResponse.json({ error: modelErrorMessage(llmResult.status, usagePlan.source) }, { status: 500 });
    }

    if (!llmResult.message) {
      return NextResponse.json({ error: '模型审视返回内容为空，请重新尝试。' }, { status: 500 });
    }

    let parsedJSON: any;
    try {
      parsedJSON = parseAssistantJSON(llmResult.message);
    } catch (parseError) {
      console.error('JSON Parse error:', parseError, 'Raw response:', llmResult.message);
      if (!usedFallbackPrompt) {
        const fallbackPrompt = buildCompactFallbackPrompt(promptInput);
          const fallbackResult = await callChatCompletions({
          baseURL: modelConfig.baseURL,
          apiKey: modelConfig.apiKey,
          modelName: modelConfig.modelName,
          system: fallbackPrompt.system,
          userPrompt: fallbackPrompt.user,
        });
        if (fallbackResult.ok && fallbackResult.message) {
          parsedJSON = parseAssistantJSON(fallbackResult.message);
          usedFallbackPrompt = true;
        }
      }
      if (!parsedJSON) {
        return NextResponse.json({ error: '大模型返回格式异常，无法转换为结构化 JSON，请重试。' }, { status: 500 });
      }
    }

    const createdAt = new Date().toISOString();
    const normalizedResult = normalizeReport({
      parsed: parsedJSON,
      mode: actualAnalysisMode,
      factCheckSources: [...factCheckSources, ...deepSources],
      meta: {
        title: title || '未命名新闻标题',
        source: source || '未知来源',
        modelName: modelConfig.modelName,
        reasoningDepth: actualReasoningDepth,
        createdAt,
        viewCount: 0,
        isPublic: actualIsPublic,
      },
    }) as any;

    normalizedResult.generationMeta = {
      usedCompactFallback: usedFallbackPrompt,
      hasWebSearchContext: Boolean(webSearchContext),
      searchProvider: searchOptions.provider || 'none',
      usageSource: usagePlan.source,
      pointCost: usagePlan.costPoints,
    };

    const scores = normalizedResult.scores;
    const newsSummaryText = normalizedResult.newsSummary || '当前材料不足，无法形成可靠摘要。';
    const saveResult = userSettings?.defaultSaveResult !== false;
    let savedAuditId = '';

    const normalizedPublishedAt = normalizedResult.meta?.publishedAt || '';
    const normalizedPublishedAtConfidence = normalizedResult.meta?.publishedAtConfidence || 'unknown';

    if (saveResult) {
      const dbRecord = await prisma.audit.create({
        data: {
          userId: currentUser.id,
          title: title || '未命名新闻标题',
          source: source || '未知来源',
          publishedAt: normalizedPublishedAt,
          publishedAtSource: 'ai_assessed',
          publishedAtConfidence: normalizedPublishedAtConfidence,
          reportType: normalizedResult.reportType,
          readingValue: normalizedResult.readingValue,
          originalContent: truncatedContent,
          focus: focus || '',
          analysisMode: actualAnalysisMode,
          reasoningDepth: actualReasoningDepth,
          modelName: modelConfig.modelName,
          newsSummary: newsSummaryText,
          auditResultJson: JSON.stringify(normalizedResult),
          credibilityScore: scores.credibility,
          informationCompletenessScore: scores.informationCompleteness,
          narrativeBiasScore: scores.narrativeBias,
          evidenceStrengthScore: scores.evidenceStrength,
          speculationRiskScore: scores.speculationRisk,
          isPublic: actualIsPublic,
          viewCount: 0,
          heatScore: 0,
        },
      });
      savedAuditId = dbRecord.id;
      await commitUsage(usagePlan, dbRecord.id);
      await recordAnalyzeEvent(currentUser.id);
    }

    return NextResponse.json({
      auditId: savedAuditId,
      result: normalizedResult,
    });
  } catch (error: any) {
    console.error('Route analyze error:', error);
    return NextResponse.json({ error: error?.message || '服务器内部处理出错，请重试' }, { status: 500 });
  }
}

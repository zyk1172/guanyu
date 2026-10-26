import type { DeepAnalysisResult } from './types';

/** Fictional, static teaching case. Never fetched, billed, or saved as a real audit. */
export function getDemoReport(language = 'zh-CN'): { originalContent: string; report: DeepAnalysisResult } {
  const zh = language.startsWith('zh');
  const copy = (cn: string, en: string) => zh ? cn : en;
  const title = copy('示例：图书馆延长开放时间', 'Example: a library extends opening hours');
  const originalQuote = copy('75份回收问卷中，有60份支持延长开放时间。', 'Of 75 returned questionnaires, 60 supported longer opening hours.');
  const originalContent = copy(
    `【虚构示例】一所社区图书馆宣布试行延长开放时间。工作人员表示，75份回收问卷中，有60份支持延长开放时间。报道据此称，这项调整满足了社区居民的需求。报道没有说明问卷如何发放、回收者是否代表全部居民，也未披露新增人力成本及试点效果。`,
    `[Fictional example] A community library announced a trial of longer opening hours. Staff said: ${originalQuote} The article concludes that the change meets residents' needs. It does not explain questionnaire distribution, whether respondents represent all residents, staffing costs, or trial outcomes.`,
  );
  const gap = copy('样本代表性未知', 'Sample representativeness is unknown');
  const next = copy('核对问卷发放与回收方法，并观察试点期间的实际到访情况。', 'Check how questionnaires were distributed and returned, then examine actual visits during the trial.');
  const conclusion = copy('回收问卷反映部分受访者的偏好，不能据此确认全体居民需求或试点效果。', 'Returned questionnaires show some respondents’ preferences; they do not establish all residents’ needs or the trial’s outcomes.');
  const finding = { title: gap, content: conclusion, judgmentType: '基于原文的合理推断' as const, evidenceGrade: 'C' as const, verificationStatus: 'source_supported' as const, speculationRisk: '中' as const, nextVerification: next, originalQuote, sourceUrls: [] };
  return { originalContent, report: {
    reportType: 'deep', methodology: '观隅九镜审读法',
    meta: { title, source: copy('虚构教学材料', 'Fictional teaching material'), publishedAt: '', publishedAtSource: 'unknown', publishedAtConfidence: 'unknown', modelName: copy('静态示例', 'Static example'), reasoningDepth: 'medium', analysisMode: 'deep', reportLanguage: zh ? 'zh-CN' : 'en-US', createdAt: '' },
    generationScope: copy('静态虚构示例；未调用模型或联网核验。', 'Static fictional example; no model or web verification was called.'),
    scoreExplanation: copy('分数仅用于演示界面，不代表真实新闻测量。', 'Scores illustrate the interface and are not measurements of real news.'),
    sourceInterpretation: { whatItSays: copy('报道用问卷支持率解释延长开放时间的决定。', 'The article uses questionnaire support to explain longer opening hours.'), coreClaims: [copy('延长开放时间满足社区需求。', 'Longer hours meet community needs.')], mainActors: [copy('图书馆、问卷回收者、其他居民', 'Library staff, respondents and other residents')], keyEvidence: [originalQuote], narrativeStyle: copy('从部分受访者的反馈推广到整个社区。', 'Feedback from some respondents is generalized to the community.'), likelyReaderImpression: copy('调整已获得全体居民支持。', 'All residents support the change.') },
    newsSummary: copy('图书馆以回收问卷为依据试行延长开放时间，但调查方法和实施效果尚未披露。', 'The library uses returned questionnaires to justify a trial of longer hours, without disclosing survey methods or outcomes.'),
    oneSentenceConclusion: conclusion, readingValue: '概览阅读', readingValueReason: copy('可以了解试点安排，需区分计划、偏好与实际成效。', 'Useful for understanding the trial; plans, preferences and outcomes should be distinguished.'),
    readingUtility: { publicImportance: 50, informationGain: 45, uniqueness: 30, explanatoryDepth: 30, actionability: 45, informationDensity: 50 },
    scores: { credibility: 50, informationCompleteness: 35, narrativeBias: 55, evidenceStrength: 35, speculationRisk: 50 },
    scoreReasons: {
      credibility: copy('报道给出了问卷数量与试点计划，但尚无独立材料核验。', 'The article provides questionnaire counts and a trial plan, but no independent verification.'),
      informationCompleteness: copy('问卷发放方法、样本代表性、新增人力成本和试点效果均未披露。', 'Questionnaire distribution, sample representativeness, additional staffing costs and trial outcomes are not disclosed.'),
      narrativeBias: copy('报道将部分问卷回复推广为整个社区的需求，叙事范围超出了现有样本。', 'The article generalizes some questionnaire responses to community-wide needs, extending its framing beyond the available sample.'),
      evidenceStrength: copy('回收问卷可支持部分受访者希望延长开放时间，不能验证试点实际成效。', 'Returned questionnaires support a preference among some respondents for longer hours; they do not establish the trial’s outcomes.'),
      speculationRisk: copy('全体居民是否受益、试点是否有效仍待确认，不能由问卷支持率直接推导。', 'Whether all residents benefit and whether the trial works remain unconfirmed; neither follows directly from questionnaire support.'),
    }, normalReaderGuide: next,
    conclusionLayers: { confirmed: [copy('材料记载了问卷数量与试点计划。', 'The material records questionnaire counts and a trial plan.')], reasonableDoubts: [gap], cannotJudgeYet: [copy('试点是否有效、是否满足全体居民需求。', 'Whether the trial works or meets all residents’ needs.')] },
    keyFindings: [finding], supportingEvidence: [{ content: originalQuote, supportsNarrative: copy('支持部分受访者希望延长开放时间。', 'Supports a preference among some respondents for longer hours.'), evidenceGrade: 'C', verificationStatus: 'source_supported', limitation: gap }],
    informationGaps: [{ title: gap, description: copy('未披露问卷发放和回收方法。', 'Distribution and return methods are not disclosed.'), whyItMatters: conclusion, currentEvidenceGrade: 'D', verificationStatus: 'pending_verification', nextVerification: next }],
    stakeholderRelations: [{ role: copy('图书馆工作人员', 'Library staff'), possibleBenefit: copy('更好地服务部分读者。', 'Serve some readers better.'), possibleCost: copy('需要额外排班，成本未知。', 'Additional staffing may be needed; costs are unknown.'), judgmentType: '待外部验证的假设', speculationRisk: '中', pendingVerification: next }],
    alternativeExplanations: [{ explanation: copy('回收问卷的人可能更关心开放时间。', 'People returning questionnaires may care more about opening hours.'), reasonableness: '中', currentEvidenceStatus: gap, speculationRisk: '中', neededVerification: next }],
    evidenceVerificationSummary: { strongestEvidence: originalQuote, weakestEvidence: gap, sourceSupportedClaims: [originalQuote], externallyVerifiedClaims: [], pendingVerificationClaims: [gap], unableToVerifyClaims: [conclusion] },
    verificationRoadmap: [{ question: next, materialType: '原始文件', whyItMatters: gap, priority: '高' }], questionsToAsk: [next], cannotConclude: [conclusion],
    onlineVerification: { enabled: false, status: 'not_enabled', verifiedSources: [], backgroundSources: [], pendingLeads: [], unableToConfirm: [gap] }, riskNotice: copy('该材料与审读结果均为虚构教学示例，不对应真实新闻。', 'Both the material and review are fictional teaching examples, not real news.'),
  } };
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildCompactFallbackPrompt, buildPrompt } from '@/lib/prompts';
import { computeReadWorth } from '@/lib/readWorth';
import { searchWeb } from '@/lib/search';
import { decryptSecret } from '@/lib/secret';

export const maxDuration = 120; // 深度模式会执行多组联网核对
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

// 安全分数修边界
function clampScore(score: any, defaultVal = 50): number {
  const val = parseInt(score, 10);
  if (isNaN(val)) return defaultVal;
  return Math.min(Math.max(val, 0), 100);
}

function confidenceFallback(label?: string): number {
  if (label === '高' || label === '充分') return 75;
  if (label === '低' || label === '不足') return 25;
  return 50;
}

function normalizeConfidencePercent(item: any, fallbackLabel?: string) {
  return {
    ...item,
    confidence_percent: clampScore(item?.confidence_percent, confidenceFallback(fallbackLabel)),
  };
}

function normalizeEvidenceGrade(value?: string): 'A' | 'B' | 'C' | 'D' | 'E' {
  return ['A', 'B', 'C', 'D', 'E'].includes(value || '') ? value as 'A' | 'B' | 'C' | 'D' | 'E' : 'D';
}

function normalizeRisk(value?: string): '高' | '中' | '低' {
  return value === '高' || value === '低' ? value : '中';
}

function normalizeVerificationStatus(value?: string): '已核验' | '部分核验' | '待验证' | '暂无法确认' {
  if (value === '已核验' || value === '部分核验' || value === '暂无法确认') return value;
  return '待验证';
}

function normalizeJudgmentType(value?: string): '原文明确事实' | '基于原文的合理推断' | '待外部验证的假设' {
  if (value === '原文明确事实' || value === '待外部验证的假设') return value;
  return '基于原文的合理推断';
}

function structuredJudgment(item: any, fallback: {
  title: string;
  detail: string;
  judgmentType?: string;
  evidenceGrade?: string;
  verificationStatus?: string;
  risk?: string;
  verificationMethod?: string;
}) {
  return {
    title: item?.title || fallback.title,
    detail: item?.detail || item?.reason || item?.why_it_matters || fallback.detail,
    judgment_type: normalizeJudgmentType(item?.judgment_type || fallback.judgmentType),
    evidence_grade: normalizeEvidenceGrade(item?.evidence_grade || item?.evidence_strength || fallback.evidenceGrade),
    verification_status: normalizeVerificationStatus(item?.verification_status || fallback.verificationStatus),
    speculation_risk: normalizeRisk(item?.speculation_risk || fallback.risk),
    verification_method: item?.verification_method || fallback.verificationMethod || '寻找原始材料、公开数据、独立报道或当事方回应进行核验。',
  };
}

function ensureNineMirrorReview(parsedJSON: any) {
  const review = parsedJSON?.nine_mirror_review || {};
  const narrative = review.narrative_frame_analysis || {};
  const normalizeModuleItem = (item: any, defaults: { judgmentType: string; status: string; grade: string; risk: string; method: string }) => ({
    ...item,
    judgment_type: normalizeJudgmentType(item?.judgment_type || defaults.judgmentType),
    verification_status: normalizeVerificationStatus(item?.verification_status || defaults.status),
    evidence_strength: normalizeEvidenceGrade(item?.evidence_strength || defaults.grade),
    speculation_risk: normalizeRisk(item?.speculation_risk || defaults.risk),
    verification_method: item?.verification_method || defaults.method,
  });
  const alternativeExplanations = Array.isArray(review.alternative_explanation_comparison)
    ? review.alternative_explanation_comparison
    : [];

  return {
    methodology_name: '观隅九镜审读法',
    atomic_claims: (Array.isArray(review.atomic_claims) ? review.atomic_claims : []).map((item: any) =>
      normalizeModuleItem(item, {
        judgmentType: item?.claim_type === '事实陈述' ? '原文明确事实' : '基于原文的合理推断',
        status: item?.claim_type === '事实陈述' ? '部分核验' : '待验证',
        grade: item?.claim_type === '事实陈述' ? 'C' : 'D',
        risk: item?.claim_type === '事实陈述' ? '低' : '中',
        method: '回到原文、原始材料和外部来源核验该主张。',
      })
    ),
    narrative_frame_analysis: {
      problem_definition: narrative.problem_definition || '模型未能稳定提取问题定义，需回看原文逐句核对。',
      responsibility_attribution: narrative.responsibility_attribution || '模型未能稳定提取责任归因，需核对原文主语和归责表述。',
      moral_position: narrative.moral_position || '模型未能稳定提取道德立场，需检查标题、导语和结尾用语。',
      implied_solution: narrative.implied_solution || '模型未能稳定提取暗示方案，需核对报道是否提出政策、行动或价值取向。',
      judgment_type: normalizeJudgmentType(narrative.judgment_type || '基于原文的合理推断'),
      verification_status: normalizeVerificationStatus(narrative.verification_status || '部分核验'),
      evidence_strength: normalizeEvidenceGrade(narrative.evidence_strength || 'D'),
      speculation_risk: normalizeRisk(narrative.speculation_risk || '中'),
      verification_method: narrative.verification_method || '回到原文逐段标注问题定义、责任主体和建议行动。',
    },
    language_frame_audit: (Array.isArray(review.language_frame_audit) ? review.language_frame_audit : []).map((item: any) =>
      normalizeModuleItem(item, {
        judgmentType: '基于原文的合理推断',
        status: '部分核验',
        grade: 'C',
        risk: '低',
        method: '回到原文语境核对该表达的使用位置和修辞效果。',
      })
    ),
    missing_perspective_matrix: (Array.isArray(review.missing_perspective_matrix) ? review.missing_perspective_matrix : []).map((item: any) =>
      normalizeModuleItem(item, {
        judgmentType: '基于原文的合理推断',
        status: '待验证',
        grade: 'D',
        risk: '中',
        method: '寻找对应主体采访、原始数据或对比报道核验该视角是否缺席。',
      })
    ),
    interest_cost_map: (Array.isArray(review.interest_cost_map) ? review.interest_cost_map : []).map((item: any) =>
      normalizeModuleItem(item, {
        judgmentType: '待外部验证的假设',
        status: '待验证',
        grade: 'D',
        risk: '中',
        method: '核对资金、政策、职责边界、合同、公开数据或当事方回应。',
      })
    ),
    evidence_ladder: (Array.isArray(review.evidence_ladder) ? review.evidence_ladder : []).map((item: any) => ({
      ...item,
      grade: normalizeEvidenceGrade(item?.grade),
      grade_reason: item?.grade_reason || '需要根据来源类型和可追溯性核验。',
      verification_method: item?.verification_method || '寻找原始文件、官方数据、公开数据库或多方独立报道。',
    })),
    causal_chain_audit: (Array.isArray(review.causal_chain_audit) ? review.causal_chain_audit : []).map((item: any) =>
      normalizeModuleItem(item, {
        judgmentType: '基于原文的合理推断',
        status: '待验证',
        grade: 'D',
        risk: '中',
        method: '寻找基准数据、对照样本、统计口径和时间序列材料。',
      })
    ),
    alternative_explanation_comparison: alternativeExplanations.map((item: any) =>
      normalizeModuleItem(item, {
        judgmentType: '待外部验证的假设',
        status: '待验证',
        grade: 'D',
        risk: '中',
        method: '寻找原始材料、数据和对比报道验证该竞争性解释。',
      })
    ),
    verification_roadmap: Array.isArray(review.verification_roadmap) ? review.verification_roadmap : [],
  };
}

function normalizeWebVerification(
  parsedJSON: any,
  factCheckSources: Awaited<ReturnType<typeof searchWeb>>,
  deepSearchSources: Awaited<ReturnType<typeof buildDeepSearchGroups>>
) {
  const existing = parsedJSON?.web_verification || {};
  const toSource = (source: any, fallbackStatus = '部分核验', fallbackGrade = 'C') => ({
    title: source?.title || '未命名来源',
    url: source?.url || '',
    source_type: source?.source_type || '相关来源',
    relevance: source?.relevance || '可作为背景核对方向。',
    verification_status: normalizeVerificationStatus(source?.verification_status || fallbackStatus),
    evidence_grade: normalizeEvidenceGrade(source?.evidence_grade || fallbackGrade),
    note: source?.note || '仅作为核对来源，不直接等同于事实结论。',
  });

  const backgroundFallback = factCheckSources.slice(0, 5).map((source) => toSource(source, '部分核验', 'C'));
  const leadFallback = deepSearchSources.flatMap((group) =>
    group.sources.slice(0, 2).map((source) => toSource({
      ...source,
      source_type: '待核验线索',
      relevance: group.topic,
    }, '待验证', 'D'))
  );

  return {
    verified_sources: Array.isArray(existing.verified_sources)
      ? existing.verified_sources.map((source: any) => toSource(source, '已核验', 'B'))
      : [],
    background_sources: Array.isArray(existing.background_sources) && existing.background_sources.length > 0
      ? existing.background_sources.map((source: any) => toSource(source, '部分核验', 'C'))
      : backgroundFallback,
    leads_to_verify: Array.isArray(existing.leads_to_verify) && existing.leads_to_verify.length > 0
      ? existing.leads_to_verify.map((source: any) => toSource(source, '待验证', 'D'))
      : leadFallback,
    unconfirmed_items: Array.isArray(existing.unconfirmed_items) && existing.unconfirmed_items.length > 0
      ? existing.unconfirmed_items
      : ['未找到 A/B 级来源直接核验的判断，应继续寻找原始文件、官方数据或多方独立报道。'],
  };
}

function normalizeReportStructure(
  parsedJSON: any,
  factCheckSources: Awaited<ReturnType<typeof searchWeb>>,
  deepSearchSources: Awaited<ReturnType<typeof buildDeepSearchGroups>>
) {
  const nineMirror = ensureNineMirrorReview(parsedJSON);
  const keyFindingsSource = Array.isArray(parsedJSON.key_findings) && parsedJSON.key_findings.length > 0
    ? parsedJSON.key_findings.slice(0, 3)
    : [
        {
          title: '表层叙事与待核验缺口并存',
          detail: parsedJSON.one_sentence_conclusion || nineMirror.narrative_frame_analysis?.problem_definition || '需要结合原文和外部材料进一步核验。',
          judgment_type: '基于原文的合理推断',
          evidence_grade: 'D',
          verification_status: '待验证',
          speculation_risk: '中',
        },
        ...(nineMirror.missing_perspective_matrix || []).slice(0, 2).map((item: any) => ({
          title: `${item.perspective_type}呈现状态：${item.status}`,
          detail: item.why_it_matters,
          judgment_type: item.judgment_type,
          evidence_grade: item.evidence_strength,
          verification_status: item.verification_status,
          speculation_risk: item.speculation_risk,
          verification_method: item.verification_method,
        })),
      ];

  parsedJSON.report_meta = {
    report_title: '观隅 · 新闻叙事审视报告',
    methodology: '观隅九镜审读法',
    generated_scope: parsedJSON.report_meta?.generated_scope || '基于用户提供原文、账号配置和可用联网线索生成；不替用户断言新闻真假。',
    scoring_note: parsedJSON.report_meta?.scoring_note || '评分用于衡量报道结构与证据状态，不等同于判断新闻真假。可信度越高表示越可信，信息完整度越高表示信息越完整，叙事倾向性越高表示引导性越强，证据强度越高表示证据越充分，推测风险越高表示越需要谨慎。',
  };
  parsedJSON.key_findings = keyFindingsSource.slice(0, 3).map((item: any, index: number) => structuredJudgment(item, {
    title: `关键发现 ${index + 1}`,
    detail: '该发现需要结合原文和外部来源进一步核验。',
    judgmentType: index === 0 ? '基于原文的合理推断' : '待外部验证的假设',
    evidenceGrade: 'D',
    verificationStatus: '待验证',
    risk: '中',
  }));
  parsedJSON.narrative_supporting_evidence = (
    Array.isArray(parsedJSON.narrative_supporting_evidence) && parsedJSON.narrative_supporting_evidence.length > 0
      ? parsedJSON.narrative_supporting_evidence
      : (nineMirror.atomic_claims || []).filter((item: any) => item.claim_type === '事实陈述').slice(0, 4).map((item: any) => ({
          title: '原文明确事实',
          detail: item.claim,
          original_basis: item.evidence_source || item.claim,
          judgment_type: '原文明确事实',
          evidence_grade: item.evidence_strength || 'C',
          verification_status: item.verification_status || '部分核验',
          speculation_risk: '低',
          verification_method: item.verification_method,
        }))
  ).map((item: any) => ({
    ...structuredJudgment(item, {
      title: '支持原文叙事的证据',
      detail: '原文提供了支持该叙事的材料。',
      judgmentType: '原文明确事实',
      evidenceGrade: 'C',
      verificationStatus: '部分核验',
      risk: '低',
    }),
    original_basis: item?.original_basis || item?.detail || item?.title || '原文明确表述',
  }));
  parsedJSON.major_information_gaps = (
    Array.isArray(parsedJSON.major_information_gaps) && parsedJSON.major_information_gaps.length > 0
      ? parsedJSON.major_information_gaps
      : (nineMirror.missing_perspective_matrix || []).filter((item: any) => item.status !== '已呈现').slice(0, 5).map((item: any) => ({
          title: `${item.perspective_type}信息不足`,
          detail: item.why_it_matters,
          missing_information: item.perspective_type,
          why_it_matters: item.why_it_matters,
          judgment_type: item.judgment_type,
          evidence_grade: item.evidence_strength,
          verification_status: item.verification_status,
          speculation_risk: item.speculation_risk,
          verification_method: item.verification_method,
        }))
  ).map((item: any) => ({
    ...structuredJudgment(item, {
      title: '主要信息缺口',
      detail: '原文未披露但影响判断的关键信息。',
      judgmentType: '基于原文的合理推断',
      evidenceGrade: 'D',
      verificationStatus: '待验证',
      risk: '中',
    }),
    missing_information: item?.missing_information || item?.title || '缺少可核验材料',
    why_it_matters: item?.why_it_matters || item?.detail || '该信息会影响对报道完整性的判断。',
  }));
  parsedJSON.nine_mirror_review = nineMirror;
  parsedJSON.web_verification = normalizeWebVerification(parsedJSON, factCheckSources, deepSearchSources);
  return parsedJSON;
}

function buildSearchContext(sources: Awaited<ReturnType<typeof searchWeb>>): string {
  if (sources.length === 0) return '';

  return sources
    .map((source, index) => {
      const snippet = source.snippet ? `\n摘要：${source.snippet}` : '';
      return `${index + 1}. ${source.title}\n链接：${source.url}${snippet}`;
    })
    .join('\n\n');
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
      'Authorization': `Bearer ${params.apiKey}`,
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
    return {
      ok: false as const,
      status: response.status,
      text,
      message: '',
    };
  }

  let data: any;
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

function parseAssistantJSON(assistantMessage: string) {
  let cleanText = assistantMessage.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.substring(7, cleanText.length - 3).trim();
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.substring(3, cleanText.length - 3).trim();
  }
  const extractJSON = (s: string): string => {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          return s.substring(start, i + 1);
        }
      }
    }
    return s;
  };
  cleanText = extractJSON(cleanText);
  return JSON.parse(cleanText);
}

async function buildDeepSearchGroups(base: {
  title?: string;
  source?: string;
  content: string;
}) {
  const core = [base.title, base.source].filter(Boolean).join(' ');
  const contentHint = base.content.slice(0, 180).replace(/\s+/g, ' ');
  const queries = [
    {
      topic: '可信度与信源核对',
      query: `${core} 信源 原文 事实 核查 ${contentHint}`.slice(0, 260),
    },
    {
      topic: '信息完整度与缺席视角',
      query: `${core} 背景 数据 缺席 争议 另一面 ${contentHint}`.slice(0, 260),
    },
    {
      topic: '利益相关方与责任主体',
      query: `${core} 利益相关方 责任 主体 平台 政府 企业 ${contentHint}`.slice(0, 260),
    },
    {
      topic: '替代解释与风险核对',
      query: `${core} 替代解释 风险 质疑 调查 报道 ${contentHint}`.slice(0, 260),
    },
    {
      topic: '叙事框架与语言倾向',
      query: `${core} 宣传 叙事 框架 舆论 语言 ${contentHint}`.slice(0, 260),
    },
  ];

  return Promise.all(
    queries.map(async (item) => ({
      ...item,
      sources: await searchWeb(item.query, 3),
    }))
  );
}

export async function POST(request: Request) {
  try {
    // 1. 登录校验 (必须登录后才能生成审视)
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: '请登录后再创建新闻审视。' },
        { status: 401 }
      );
    }

    const userId = currentUser.id;

    // 2. 读取用户账号配置
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const body = await request.json();
    const { title, source, date, content, focus, mode } = body;

    // 3. 正文校验
    if (!content || content.trim().length < 50) {
      return NextResponse.json(
        { error: '新闻正文太短，最少需要 50 个字符。' },
        { status: 400 }
      );
    }

    // 4. 截断超长正文
    const truncatedContent = content.slice(0, MAX_NEWS_CONTENT_LENGTH);

    // 5. 确定本次实际使用的模型与思考深度
    const defaultModel = process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o';
    const actualModelName = userSettings?.defaultModelName || defaultModel;
    const actualReasoningDepth = normalizeThinkingDepth(userSettings?.defaultReasoningDepth);
    const requestedMode = mode || userSettings?.defaultAnalysisMode || 'quick';
    const actualAnalysisMode = VALID_ANALYSIS_MODES.has(requestedMode) ? requestedMode : 'quick';
    const actualIsPublic = userSettings?.defaultIsPublic !== undefined ? userSettings.defaultIsPublic : true;

    const searchQuery = [title, source, truncatedContent.slice(0, 120)]
      .filter(Boolean)
      .join(' ')
      .slice(0, 240);
    const factCheckSources = await searchWeb(searchQuery, 5);
    const deepSearchSources = actualAnalysisMode === 'deep'
      ? await buildDeepSearchGroups({ title, source, content: truncatedContent })
      : [];
    const webSearchContext = buildSearchContext(factCheckSources);
    const deepSearchContext = deepSearchSources.length > 0
      ? deepSearchSources
          .map((group) => `【${group.topic}】\n${buildSearchContext(group.sources) || '未检索到可用线索'}`)
          .join('\n\n')
      : '';

    const promptInput = {
      title: title || '未知标题',
      source: source || '未知来源',
      date: date || '未知时间',
      content: truncatedContent,
      focus,
      mode: actualAnalysisMode,
      reasoningDepth: actualReasoningDepth,
      webSearchContext: [webSearchContext, deepSearchContext].filter(Boolean).join('\n\n'),
    };
    const { system, user: userPrompt } = buildPrompt(promptInput);

    // 7. 调用大模型接口
    if (!userSettings?.llmApiKeyEncrypted) {
      return NextResponse.json(
        { error: '未配置大模型 API Key，请先到账号管理中保存大模型密钥。' },
        { status: 500 }
      );
    }
    const apiKey = decryptSecret(userSettings.llmApiKeyEncrypted);
    const baseURL = userSettings.llmBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    let usedFallbackPrompt = false;
    let llmResult = await callChatCompletions({
      baseURL,
      apiKey,
      modelName: actualModelName,
      system,
      userPrompt,
    });

    if (!llmResult.ok) {
      console.error('LLM API error:', llmResult.text);
      if (llmResult.status >= 500) {
        const fallbackPrompt = buildCompactFallbackPrompt(promptInput);
        usedFallbackPrompt = true;
        llmResult = await callChatCompletions({
          baseURL,
          apiKey,
          modelName: actualModelName,
          system: fallbackPrompt.system,
          userPrompt: fallbackPrompt.user,
        });
      }
    }

    if (!llmResult.ok) {
      console.error('LLM API fallback error:', llmResult.text);
      return NextResponse.json(
        { error: `模型审视调用失败 (状态码 ${llmResult.status})` },
        { status: 500 }
      );
    }

    const assistantMessage = llmResult.message;

    if (!assistantMessage) {
      return NextResponse.json(
        { error: '模型审视返回内容为空，请重新尝试。' },
        { status: 500 }
      );
    }

    // 8. 解析并校验 AI 严格 JSON 结果
    let parsedJSON: any;
    try {
      parsedJSON = parseAssistantJSON(assistantMessage);
    } catch (parseError) {
      console.error('JSON Parse error:', parseError, 'Raw response:', assistantMessage);
      if (!usedFallbackPrompt) {
        const fallbackPrompt = buildCompactFallbackPrompt(promptInput);
        const fallbackResult = await callChatCompletions({
          baseURL,
          apiKey,
          modelName: actualModelName,
          system: fallbackPrompt.system,
          userPrompt: fallbackPrompt.user,
        });

        if (fallbackResult.ok && fallbackResult.message) {
          try {
            usedFallbackPrompt = true;
            parsedJSON = parseAssistantJSON(fallbackResult.message);
          } catch (fallbackParseError) {
            console.error('Fallback JSON Parse error:', fallbackParseError, 'Raw response:', fallbackResult.message);
          }
        } else {
          console.error('Fallback LLM API error after parse failure:', fallbackResult.text);
        }
      }

      if (!parsedJSON) {
        return NextResponse.json(
          { error: '大模型返回格式异常，无法转换为结构化 JSON，请重试。' },
          { status: 500 }
        );
      }
    }

    // 9. 校准和抽取核心分数
    const scores = parsedJSON.score_summary || {};
    const credScore = clampScore(scores.credibility_score, 70);
    const compScore = clampScore(scores.information_completeness_score, 70);
    const biasScore = clampScore(scores.narrative_bias_score, 40);
    const evScore = clampScore(scores.evidence_strength_score, 70);
    const specScore = clampScore(scores.speculation_risk_score, 30);

    const newsSummaryText = parsedJSON.news_summary || '对原文正文的客观提炼缺失。';

    parsedJSON = normalizeReportStructure(parsedJSON, factCheckSources, deepSearchSources);
    parsedJSON.read_worth = computeReadWorth(parsedJSON);
    parsedJSON.generation_meta = {
      ...(parsedJSON.generation_meta || {}),
      used_compact_fallback: usedFallbackPrompt,
    };
    parsedJSON.fact_check_sources = factCheckSources;
    parsedJSON.deep_search_sources = deepSearchSources;

    // 10. 保存审视结果到数据库
    const saveResult = userSettings?.defaultSaveResult !== false;
    let savedAuditId = '';

    if (saveResult) {
      const dbRecord = await prisma.audit.create({
        data: {
          userId,
          title: title || '未命名新闻标题',
          source: source || '未知来源',
          publishedAt: date || '未知发布时间',
          originalContent: truncatedContent,
          focus: focus || '',
          analysisMode: actualAnalysisMode,
          reasoningDepth: actualReasoningDepth,
          modelName: actualModelName,
          newsSummary: newsSummaryText,
          auditResultJson: JSON.stringify(parsedJSON),
          credibilityScore: credScore,
          informationCompletenessScore: compScore,
          narrativeBiasScore: biasScore,
          evidenceStrengthScore: evScore,
          speculationRiskScore: specScore,
          isPublic: actualIsPublic,
          viewCount: 0,
          heatScore: 0,
        },
      });
      savedAuditId = dbRecord.id;
    }

    // 11. 返回新创建的 ID 和解析结果
    return NextResponse.json({
      auditId: savedAuditId,
      result: parsedJSON,
    });

  } catch (error: any) {
    console.error('Route analyze error:', error);
    return NextResponse.json(
      { error: '服务器内部处理出错，请重试' },
      { status: 500 }
    );
  }
}

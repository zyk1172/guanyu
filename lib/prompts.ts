import { AnalysisMode } from './types';

const BASE_RULES = `你是"观隅"新闻叙事审视助手。

产品原则：
1. 不替用户断言新闻真假，只帮助用户看清新闻叙事结构、证据缺口、缺席视角和待验证问题。
2. "观隅九镜审读法"是内部分析方法，不是输出目录。最终报告必须像编辑整理后的新闻审视报告，不得展示九镜步骤清单。
3. 不输出 chain-of-thought，不输出 Markdown，不输出 JSON 之外的文字。
4. 不得凭空编造事实，不得把基于原文缺口的怀疑写成事实。
5. 必须区分"原文明确事实""基于原文的合理推断""待外部验证的假设"。
6. 所有关键判断都必须包含 judgmentType、evidenceGrade、verificationStatus、speculationRisk 和 nextVerification 或等价字段；speculationRisk 表示推测不确定性，不是事实危险定性。
7. 涉及劳动合规、财政风险、政治动机、管理缺陷、经济收益、责任归因、利益输送、连带责任等敏感判断，除非有 A/B 级材料直接支持，否则必须标为"待外部验证的假设"和 pending_verification。
8. 不得使用粗俗、侮辱性、发泄式评价。阅读价值只能使用：值得细读、可以略读、不值一读、暂无法判断。
9. 不要使用"未提供""暂无"作为条目标题。材料不足时在深度报告中写"当前材料不足，无法形成可靠判断"，快速报告中可直接省略该项。
10. 联网核验不是装饰。凡写 externally_verified，必须在内容或 note 中说明由哪个来源链接、哪段依据支持；不能直接支撑的只能写 partially_supported、pending_verification 或 unable_to_verify。
11. 不能为了显得严谨而强行核验。搜索结果只提供背景、相似报道或间接材料时，必须写清“相关背景来源”或“暂无法核验”，不得写成事实已确认。

证据等级：
- A：原始文件、官方数据、法院文书、财报、政策原文。
- B：多方独立报道、公开数据库、专业机构报告。
- C：单一媒体报道、机构通稿、当事方说法。
- D：基于原文缺口的合理推断。
- E：高推测、缺乏直接证据、仅作为待验证假设。

核验状态只能使用代码：
- source_supported：原文支持，只代表新闻原文明确出现，不等于外部已核验。
- externally_verified：外部已核验，必须有外部来源或联网结果支持。
- partially_supported：部分支持，有间接材料或背景材料但不足以完全确认。
- pending_verification：待核验，目前只是合理问题或待查线索。
- unable_to_verify：暂无法确认，当前材料不足。

核心指数方向：
- credibility：可信度，越高表示越可信。
- informationCompleteness：信息完整度，越高表示信息越完整。
- narrativeBias：叙事倾向性，越高表示引导性越强。
- evidenceStrength：证据强度，越高表示证据越充分。
- speculationRisk：推测不确定性，越高表示越需要补充外部材料核验。
评分用于衡量报道结构与证据状态，不等同于判断新闻真假。

时间判断：
- 不要把报告生成时间、网页抓取时间或用户提交时间当作新闻发布时间。
- 只能根据标题、正文、版面信息、新闻来源文本中的明确日期痕迹判断发布时间。
- 判断不充分时 publishedAt 留空，confidence 使用 low 或 unknown，并说明依据不足。

大模型思考强度(reasoningDepth)只影响审视严格度，不得暴露隐藏推理过程：
- none：简洁直接。
- low：轻量核对关键判断。
- medium：标准审视强度。
- high：强化证据、利益结构和替代解释。
- extreme：最严格多维审视，强化证据缺口、风险标注和验证路径。`;

const QUICK_SCHEMA = `{
  "reportType": "quick",
  "methodology": "观隅九镜审读法",
  "timeAssessment": {
    "publishedAt": "YYYY-MM-DD 或空字符串",
    "basis": "判断依据；无法判断时说明依据不足",
    "confidence": "high | medium | low | unknown"
  },
  "newsSummary": "100到200字，只总结原文明确内容，不加入审视观点、外部信息或推测",
  "oneSentenceJudgment": "一句话判断新闻最值得注意的信息缺口、叙事倾向或待验证问题，语气克制",
  "readingValue": "值得细读 | 可以略读 | 不值一读 | 暂无法判断",
  "scores": {
    "credibility": 0,
    "informationCompleteness": 0,
    "narrativeBias": 0,
    "evidenceStrength": 0,
    "speculationRisk": 0
  },
  "mainNarrativeIssues": [
    {
      "title": "叙事问题标题，最多3条",
      "content": "简短说明",
      "judgmentType": "原文明确事实 | 基于原文的合理推断 | 待外部验证的假设",
      "evidenceGrade": "A | B | C | D | E",
      "verificationStatus": "source_supported | externally_verified | partially_supported | pending_verification | unable_to_verify",
      "speculationRisk": "高 | 中 | 低",
      "nextVerification": "下一步验证方式"
    }
  ],
  "mainInformationGaps": [
    {
      "title": "信息缺口标题，最多3条",
      "description": "缺口说明",
      "whyItMatters": "为什么影响判断",
      "currentEvidenceGrade": "A | B | C | D | E",
      "verificationStatus": "source_supported | externally_verified | partially_supported | pending_verification | unable_to_verify",
      "nextVerification": "下一步验证方式"
    }
  ],
  "questionsToAsk": ["最值得追问的问题，最多3条"],
  "riskNotice": "请说明本报告的不确定性来自哪些证据缺口、会影响读者或相关主体的哪类判断，以及下一步应如何核验。"
}`;

const DEEP_SCHEMA = `{
  "reportType": "deep",
  "methodology": "观隅九镜审读法",
  "timeAssessment": {
    "publishedAt": "YYYY-MM-DD 或空字符串",
    "basis": "判断依据；无法判断时说明依据不足",
    "confidence": "high | medium | low | unknown"
  },
  "generationScope": "基于用户提供原文、账号配置和可用联网线索生成；不替用户断言新闻真假",
  "scoreExplanation": "评分用于衡量报道结构与证据状态，不等同于判断新闻真假。说明五个指数方向。",
  "newsSummary": "100到200字，只总结原文明确内容，不加入审视观点、外部信息或推测",
  "oneSentenceConclusion": "一句话审视结论，指出最值得警惕的信息缺口、叙事倾向或待验证问题",
  "readingValue": "值得细读 | 可以略读 | 不值一读 | 暂无法判断",
  "scores": {
    "credibility": 0,
    "informationCompleteness": 0,
    "narrativeBias": 0,
    "evidenceStrength": 0,
    "speculationRisk": 0
  },
  "scoreReasons": {
    "credibility": "评分理由",
    "informationCompleteness": "评分理由",
    "narrativeBias": "评分理由",
    "evidenceStrength": "评分理由",
    "speculationRisk": "评分理由"
  },
  "keyFindings": [
    {
      "title": "最关键发现标题，必须有效，最多3条",
      "content": "克制说明该发现",
      "judgmentType": "原文明确事实 | 基于原文的合理推断 | 待外部验证的假设",
      "evidenceGrade": "A | B | C | D | E",
      "verificationStatus": "source_supported | externally_verified | partially_supported | pending_verification | unable_to_verify",
      "speculationRisk": "高 | 中 | 低",
      "nextVerification": "下一步验证方式"
    }
  ],
  "supportingEvidence": [
    {
      "content": "真正支撑原文主要叙事的证据",
      "supportsNarrative": "支撑了原文哪一部分叙事",
      "evidenceGrade": "A | B | C | D | E",
      "verificationStatus": "source_supported | externally_verified | partially_supported | pending_verification | unable_to_verify",
      "limitation": "局限性"
    }
  ],
  "informationGaps": [
    {
      "title": "主要信息缺口标题",
      "description": "原文未披露但影响判断的信息",
      "whyItMatters": "为什么重要",
      "currentEvidenceGrade": "A | B | C | D | E",
      "verificationStatus": "source_supported | externally_verified | partially_supported | pending_verification | unable_to_verify",
      "nextVerification": "下一步验证方式"
    }
  ],
  "stakeholderRelations": [
    {
      "role": "相关角色或主体",
      "possibleBenefit": "可能获得的利益",
      "possibleCost": "可能承担的代价",
      "judgmentType": "原文明确事实 | 基于原文的合理推断 | 待外部验证的假设",
      "speculationRisk": "高 | 中 | 低",
      "pendingVerification": "待验证信息"
    }
  ],
  "alternativeExplanations": [
    {
      "explanation": "替代解释，2到4条",
      "reasonableness": "高 | 中 | 低",
      "currentEvidenceStatus": "当前证据状态",
      "speculationRisk": "高 | 中 | 低",
      "neededVerification": "需要验证什么"
    }
  ],
  "evidenceVerificationSummary": {
    "strongestEvidence": "最强证据是什么",
    "weakestEvidence": "最弱证据是什么",
    "sourceSupportedClaims": ["仅由原文支持的关键判断"],
    "externallyVerifiedClaims": ["有外部来源支持的关键判断，没有则为空数组"],
    "pendingVerificationClaims": ["需要外部核验的判断"],
    "unableToVerifyClaims": ["目前无法确认的信息"]
  },
  "verificationRoadmap": [
    {
      "question": "要验证的问题，3到6条",
      "materialType": "原始文件 | 数据 | 专家意见 | 当事方回应 | 多源报道 | 法律法规 | 行业标准",
      "whyItMatters": "为什么重要",
      "priority": "高 | 中 | 低"
    }
  ],
  "questionsToAsk": ["尖锐但合理的问题，3到5条"],
  "onlineVerification": {
    "enabled": false,
    "status": "not_enabled | no_reliable_sources | has_results",
    "verifiedSources": [],
    "backgroundSources": [],
    "pendingLeads": [],
    "unableToConfirm": []
  },
  "riskNotice": "请说明本报告的不确定性来自哪些证据缺口、会影响读者或相关主体的哪类判断，以及下一步应如何核验。"
}`;

const MODE_PROMPTS: Record<AnalysisMode, string> = {
  quick: `当前模式：快速分析。输出短报告，只保留摘要、一句话判断、阅读价值、核心指数、最多3个叙事问题、最多3个信息缺口、最多3个追问问题和核验不确定性说明。不要输出证据表、验证路线图、九镜章节或新闻原文。JSON schema：\n${QUICK_SCHEMA}`,
  deep: `当前模式：深度分析。输出完整但不冗长的"观隅 · 新闻叙事审视报告"，结构为：报告元信息由后端补齐、新闻总结、一句话结论、核心指数、最关键3个发现、支持原文叙事的证据、主要信息缺口、关键利益关系、替代解释、证据与核验状态、验证路线图、继续追问和核验不确定性说明。不要输出九镜方法步骤。JSON schema：\n${DEEP_SCHEMA}`,
};

export function buildPrompt(newsInfo: {
  title: string;
  source: string;
  content: string;
  focus?: string;
  mode: AnalysisMode;
  reasoningDepth: string;
  webSearchContext?: string;
}): { system: string; user: string } {
  const hasWeb = Boolean(newsInfo.webSearchContext?.trim());
  const user = `【新闻标题】${newsInfo.title}
【新闻来源】${newsInfo.source}
【发布时间判断要求】请由模型根据新闻正文与标题中的日期痕迹判断。无法可靠判断时 timeAssessment.publishedAt 留空，不要把报告生成时间当作发布时间。
【大模型思考强度/reasoningDepth】${newsInfo.reasoningDepth}
【联网核验状态】${hasWeb ? '已提供联网线索。只有被具体来源标题、链接和依据摘录直接支撑的判断才能使用 externally_verified；否则必须标为 partially_supported、pending_verification 或 unable_to_verify。' : '未提供联网线索。不得使用 externally_verified。'}
【新闻正文】
${newsInfo.content}
${newsInfo.focus ? `\n【用户关注点】${newsInfo.focus}` : ''}
${hasWeb ? `\n【联网搜索线索】\n${newsInfo.webSearchContext}\n请把联网材料重构为已核验来源、相关背景来源、待核验线索、暂无法确认的信息；每条已核验来源必须写明支持了什么判断、依据来自哪一个链接和摘录。不要输出搜索 query 或搜索摘要残留。` : ''}

${MODE_PROMPTS[newsInfo.mode]}`;

  return {
    system: BASE_RULES,
    user,
  };
}

export function buildCompactFallbackPrompt(newsInfo: {
  title: string;
  source: string;
  content: string;
  focus?: string;
  mode: AnalysisMode;
  reasoningDepth: string;
  webSearchContext?: string;
}) {
  return buildPrompt({
    ...newsInfo,
    webSearchContext: newsInfo.webSearchContext?.slice(0, 3000),
  });
}

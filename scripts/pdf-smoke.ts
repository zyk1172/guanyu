import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderProfessionalPdf } from '../lib/pdf-renderer';

const output = path.join(process.cwd(), 'output', 'pdf');

const base = {
  id: 'pdf-smoke-001',
  title: '台风影响与应急响应的新闻叙事示例',
  source: 'Example Newsroom',
  publishedAt: '2026-07-16T09:00:00Z',
  newsSummary: '报道描述一场台风登陆后的疏散、交通中断与救援安排，并引用官方通报与居民说法。文中说明了受影响地区和部分应对措施，但没有完整披露损失统计与数据口径。',
  originalContent: `${'这是用于 PDF 排版核验的新闻原文示例。它不代表真实新闻或事实结论。正文用于检查中文字体、长段落、页眉页脚和附录分页是否正常显示。'.repeat(520)}\n\n后续内容应在专业附录上限处被稳定截断，而不是拖慢或阻塞导出函数。`,
  modelName: 'DeepSeek V4 Pro',
  reasoningDepth: 'high',
  createdAt: new Date('2026-07-16T10:00:00Z'),
  reportVersion: 1,
};

const report = {
  methodology: '观隅九镜审读法',
  sourceInterpretation: {
    whatItSays: '原文围绕台风登陆后的人员疏散、交通中断与救援部署展开，主要依据官方通报和个别居民表述。',
    coreClaims: ['疏散规模足以表明应急响应有效。', '交通中断反映灾害影响广泛。'],
    mainActors: ['地方应急管理部门', '受影响居民', '交通运营机构'],
    keyEvidence: ['官方通报的疏散与交通调整数字。', '居民对现场情况的直接描述。'],
    narrativeStyle: '以应急响应效率为中心组织材料，对损失统计和数据口径的说明较少。',
    likelyReaderImpression: '相关部门已采取充分措施，影响主要处于可控状态。',
  },
  readingValue: '深度阅读',
  readingUtility: {
    publicImportance: 82,
    informationGain: 78,
    uniqueness: 72,
    explanatoryDepth: 76,
    actionability: 70,
    informationDensity: 74,
  },
  readingValueReason: '报道提供了明确事件线索，但应将官方数字与独立损失评估分开阅读。',
  normalReaderGuide: '先核对原始通报和统计口径，再比较多方报道；不要把救援部署直接等同于灾后成效。',
  oneSentenceConclusion: '原文提供了事件轮廓，但关键损失数据与独立佐证仍需核验。',
  scoreReasons: {
    credibility: '主要事件由可定位的官方通报支持，但仍缺少足够的独立交叉验证。',
    informationCompleteness: '损失规模、统计方法和受影响群体细分信息不完整。',
    narrativeBias: '原文较强调救援响应，对执行困难和损失后果的披露较少。',
    evidenceStrength: '部分时间地点信息可与公开资料核对，但关键数字主要来自单一通报。',
    speculationRisk: '替代解释以待核验假设呈现，没有作为既成事实。',
  },
  scores: { credibility: 68, informationCompleteness: 51, narrativeBias: 43, evidenceStrength: 57, speculationRisk: 35 },
  conclusionLayers: {
    confirmed: ['原文确实提及台风登陆、疏散和交通调整。'],
    reasonableDoubts: ['单一通报不足以完整证明所有损失和疏散规模。'],
    cannotJudgeYet: ['尚不能仅据现有材料判断救援措施的长期效果。'],
  },
  keyFindings: [{ title: '官方数据构成主要信息来源', description: '多项关键数字来自单一通报，读者应注意数据口径。' }, { title: '损失估算尚不完整', description: '缺少可复核的经济损失和受影响群体细分。' }],
  supportingEvidence: [{ content: '原文给出登陆时间和地点，并可与气象资料交叉核验。', supportsNarrative: '支持台风已经登陆且已触发应急响应的基本叙事。', evidenceGrade: 'B', verificationStatus: 'partially_supported', limitation: '尚未看到原始观测记录和完整统计表。' }],
  informationGaps: [{ title: '损失统计方法', description: '未说明统计范围、时间点与汇总方法。', whyItMatters: '统计范围决定损失规模能否与其他报告比较。', evidenceGrade: 'D', verificationStatus: 'pending_verification', nextVerification: '查阅应急管理部门发布的原始统计表。' }],
  stakeholderRelations: [{ role: '地方应急管理部门', possibleBenefit: '及时发布信息有助于公众了解响应安排。', possibleCost: '如果数字口径不透明，公众可能无法评估应急工作的实际效果。', judgmentType: '基于原文的合理推断', speculationRisk: '中', pendingVerification: '核对原始数据、预算和灾后评估。' }],
  alternativeExplanations: [{ explanation: '疏散数字可能随统计口径变化', currentEvidenceStatus: '现有材料未披露统计口径和更新记录。', speculationRisk: '中', neededVerification: '查看原始通报、后续修订和独立评估。' }],
  evidenceVerificationSummary: {
    strongestEvidence: '登陆时间和地点等基础信息可与公开气象记录交叉核验。',
    weakestEvidence: '损失规模和受影响群体细分缺少独立来源。',
    sourceSupportedClaims: ['官方通报描述了疏散安排。'],
    externallyVerifiedClaims: ['台风登陆时间可由公开气象资料核对。'],
    pendingVerificationClaims: ['疏散总数和损失统计方法。'],
    unableToVerifyClaims: ['现有材料不足以确认长期恢复成效。'],
  },
  verificationRoadmap: [{ question: '官方损失统计的原始表格在哪里？', materialType: '原始文件', whyItMatters: '这是比较不同损失口径的基础。', priority: '高' }],
  questionsToAsk: ['统计范围是否覆盖全部受影响地区？', '是否存在独立机构的损失评估？'],
  onlineVerification: {
    verifiedSources: [{
      title: '示例气象与应急公开资料',
      url: 'https://example.com/official-source',
      snippet: '该资料可用于核对台风登陆时间与地点。',
      evidenceGrade: 'B',
      verificationStatus: 'partially_supported',
    }],
    backgroundSources: [{ title: '示例背景研究', url: 'https://example.com/background', snippet: '用于解释当地防灾体系的历史背景。', evidenceGrade: 'C', verificationStatus: 'source_supported' }],
    pendingLeads: [{ title: '示例待核验数据表', url: 'https://example.com/to-verify', snippet: '需要核对其发布者和数据口径。', evidenceGrade: 'D', verificationStatus: 'pending_verification' }],
    unableToConfirm: ['当前没有足够材料确认灾后经济损失的完整规模。'],
  },
  cannotConclude: ['不能仅凭该报道确认应急响应已经取得长期成效。'],
  riskNotice: '本报告的限制主要来自公开材料的可得性和外部核验覆盖范围。它用于帮助读者识别证据状态，不构成事实定论。',
};

const englishReport = {
  methodology: 'Guanyu Nine-Lens Reading',
  sourceInterpretation: {
    whatItSays: 'The article describes evacuations, disruption, and relief arrangements after landfall, relying principally on official notices and a resident account.',
    coreClaims: ['The scale of evacuation indicates an effective emergency response.', 'Transport disruption shows the breadth of the storm’s impact.'],
    mainActors: ['Local emergency-management authorities', 'Affected residents', 'Transport operators'],
    keyEvidence: ['Official evacuation and transport-adjustment figures.', 'A resident account of local conditions.'],
    narrativeStyle: 'The report foregrounds response capacity and gives less detail on loss methodology and affected groups.',
    likelyReaderImpression: 'Authorities took sufficient measures and the impact remained manageable.',
  },
  readingValue: '深度阅读',
  readingValueReason: 'The report establishes an event timeline, but official figures should be distinguished from independently audited assessments.',
  readingUtility: {
    publicImportance: 82,
    informationGain: 78,
    uniqueness: 72,
    explanatoryDepth: 76,
    actionability: 70,
    informationDensity: 74,
  },
  normalReaderGuide: 'Check the primary notices and counting method first, then compare independent reports. Do not equate deployment with long-term recovery outcomes.',
  oneSentenceConclusion: 'The article establishes the event outline, but its key loss figures and independent corroboration still require verification.',
  scoreReasons: {
    credibility: 'Core event details are traceable to official notices, although independent corroboration remains limited.',
    informationCompleteness: 'Loss estimates, counting methods, and population breakdowns are incomplete.',
    narrativeBias: 'The article gives more prominence to response actions than to implementation difficulties and losses.',
    evidenceStrength: 'Timing and location can be checked against public records, but material figures rely on a single notice.',
    speculationRisk: 'Alternative explanations are presented as hypotheses for verification rather than settled facts.',
  },
  scores: { credibility: 68, informationCompleteness: 51, narrativeBias: 43, evidenceStrength: 57, speculationRisk: 35 },
  conclusionLayers: {
    confirmed: ['The article explicitly reports landfall, evacuation, and transport adjustments.'],
    reasonableDoubts: ['A single notice is insufficient to establish every loss and evacuation total.'],
    cannotJudgeYet: ['The available material cannot establish the long-term effect of response measures.'],
  },
  keyFindings: [{ title: 'Official data is the principal source', description: 'Several material figures come from a single official statement, so readers should confirm the methodology.' }, { title: 'Loss estimates remain incomplete', description: 'The article does not provide a fully auditable estimate of economic loss or affected populations.' }],
  supportingEvidence: [{ content: 'The article states landfall timing and location, which can be cross-checked against meteorological records.', supportsNarrative: 'Supports the core account that landfall triggered an emergency response.', evidenceGrade: 'B', verificationStatus: 'partially_supported', limitation: 'The original observation record and complete statistical table are not provided.' }],
  informationGaps: [{ title: 'Loss estimation method', description: 'The report does not state the counting scope, reference time, or aggregation method.', whyItMatters: 'The scope determines whether loss figures can be compared with other assessments.', evidenceGrade: 'D', verificationStatus: 'pending_verification', nextVerification: 'Review the primary emergency-management statistical tables.' }],
  stakeholderRelations: [{ role: 'Local emergency-management authorities', possibleBenefit: 'Timely releases can help the public understand response arrangements.', possibleCost: 'Opaque counting methods may prevent the public from assessing real response outcomes.', judgmentType: 'Reasonable inference from the article', speculationRisk: 'Medium', pendingVerification: 'Review primary data, budgets, and post-event assessments.' }],
  alternativeExplanations: [{ explanation: 'Evacuation totals may depend on changing counting rules', currentEvidenceStatus: 'The available material does not disclose the counting method or revision history.', speculationRisk: 'Medium', neededVerification: 'Review primary notices, later revisions, and independent assessments.' }],
  evidenceVerificationSummary: {
    strongestEvidence: 'Basic landfall information can be cross-checked against public meteorological records.',
    weakestEvidence: 'Loss scale and population breakdowns lack independent sourcing.',
    sourceSupportedClaims: ['An official notice describes evacuation arrangements.'],
    externallyVerifiedClaims: ['Landfall timing can be checked against public weather records.'],
    pendingVerificationClaims: ['Evacuation totals and the loss-estimation method.'],
    unableToVerifyClaims: ['The available material cannot confirm long-term recovery outcomes.'],
  },
  verificationRoadmap: [{ question: 'Where is the original table for official loss statistics?', materialType: 'Primary document', whyItMatters: 'It is necessary for comparing loss-counting methods.', priority: 'High' }],
  questionsToAsk: ['Does the count cover every affected area?', 'Is there an independent loss assessment?'],
  onlineVerification: {
    verifiedSources: [{
      title: 'Example public weather and emergency source',
      url: 'https://example.com/official-source',
      snippet: 'Useful for checking landfall timing and location.',
      evidenceGrade: 'B',
      verificationStatus: 'partially_supported',
    }],
    backgroundSources: [{ title: 'Example background research', url: 'https://example.com/background', snippet: 'Provides historical context on the regional preparedness system.', evidenceGrade: 'C', verificationStatus: 'source_supported' }],
    pendingLeads: [{ title: 'Example loss data table', url: 'https://example.com/to-verify', snippet: 'Its publisher and counting method require confirmation.', evidenceGrade: 'D', verificationStatus: 'pending_verification' }],
    unableToConfirm: ['There is not enough material to establish the complete scale of economic loss.'],
  },
  cannotConclude: ['The article alone cannot establish that the response achieved long-term success.'],
  riskNotice: 'The limitations of this report arise from the availability of public material and the scope of external verification. It helps readers identify evidence status and is not a factual verdict.',
};

async function main() {
  await mkdir(output, { recursive: true });
  for (const [language, filename] of [['zh-CN', 'guanyu-professional-zh.pdf'], ['en-US', 'guanyu-professional-en.pdf']] as const) {
    const audit = language === 'zh-CN'
      ? { ...base, reportLanguage: language, auditResultJson: JSON.stringify(report) }
      : {
          ...base,
          title: 'A narrative review of typhoon impacts and emergency response',
          source: 'Example Newsroom',
          newsSummary: 'The article describes post-landfall evacuations, transport disruption, and relief measures. It cites official notices and resident accounts, but does not fully disclose loss statistics or data methodology.',
          originalContent: `${'This English sample source text tests long-form body copy, headers, footers, and appendix pagination for the professional report template. It does not represent a real news event or conclusion. '.repeat(520)}\n\nThe appendix must truncate predictably rather than slowing or blocking export.`,
          reportLanguage: language,
          auditResultJson: JSON.stringify(englishReport),
        };
    const pdf = await renderProfessionalPdf(audit);
    await writeFile(path.join(output, filename), pdf);
    console.log(`${filename}: ${pdf.byteLength} bytes`);
  }
}

void main();

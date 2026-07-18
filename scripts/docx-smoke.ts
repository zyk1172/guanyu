import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderProfessionalWord } from '../lib/docx-renderer';

const output = path.join(process.cwd(), 'output', 'docx');

const report = {
  methodology: '观隅九镜审读法',
  sourceInterpretation: {
    whatItSays: '原文描述台风登陆后的人员疏散、交通中断与救援安排，主要依据官方通报与居民表述。',
    coreClaims: ['疏散规模足以表明应急响应有效。', '交通中断反映灾害影响广泛。'],
    keyEvidence: ['官方通报的疏散与交通调整数字。', '居民对现场情况的直接描述。'],
    narrativeStyle: '报道强调应急响应效率，对损失统计和数据口径的说明较少。',
  },
  scores: { credibility: 68, informationCompleteness: 51, narrativeBias: 43, evidenceStrength: 57, speculationRisk: 35 },
  keyFindings: [{ title: '官方数据构成主要信息来源', description: '多项关键数字来自单一通报，读者应注意数据口径。', evidenceGrade: 'C', verificationStatus: 'partially_supported' }, { title: '损失估算尚不完整', description: '缺少可复核的经济损失和受影响群体细分。', evidenceGrade: 'D', verificationStatus: 'pending_verification' }],
  supportingEvidence: [{ content: '原文给出登陆时间和地点，并可与气象资料交叉核验。', supportsNarrative: '支持台风已经登陆且已触发应急响应的基本叙事。', evidenceGrade: 'B', verificationStatus: 'partially_supported', limitation: '尚未看到原始观测记录和完整统计表。' }],
  informationGaps: [{ title: '损失统计方法', description: '未说明统计范围、时间点与汇总方法。', whyItMatters: '统计范围决定损失规模能否与其他报告比较。', evidenceGrade: 'D', verificationStatus: 'pending_verification', nextVerification: '查阅应急管理部门发布的原始统计表。' }],
  stakeholderRelations: [{ role: '地方应急管理部门', possibleBenefit: '及时发布信息有助于公众了解响应安排。', possibleCost: '如果数字口径不透明，公众难以评估实际效果。', judgmentType: '基于原文的合理推断', speculationRisk: '中' }],
  alternativeExplanations: [{ explanation: '疏散数字可能随统计口径变化', currentEvidenceStatus: '现有材料未披露统计口径和更新记录。', speculationRisk: '中', neededVerification: '查看原始通报、后续修订和独立评估。' }],
  verificationRoadmap: [{ question: '官方损失统计的原始表格在哪里？', materialType: '原始文件', whyItMatters: '这是比较不同损失口径的基础。', priority: '高' }],
  questionsToAsk: ['统计范围是否覆盖全部受影响地区？', '是否存在独立机构的损失评估？'],
  onlineVerification: { verifiedSources: [{ title: '示例气象与应急公开资料', url: 'https://example.com/official-source', snippet: '可用于核对台风登陆时间与地点。', evidenceGrade: 'B', verificationStatus: 'partially_supported' }], backgroundSources: [{ title: '示例背景研究', url: 'https://example.com/background', snippet: '解释当地防灾体系的历史背景。', evidenceGrade: 'C', verificationStatus: 'source_supported' }], pendingLeads: [{ title: '示例待核验数据表', url: 'https://example.com/to-verify', snippet: '需要核对其发布者和数据口径。', evidenceGrade: 'D', verificationStatus: 'pending_verification' }] },
  riskNotice: '本报告的限制主要来自公开材料的可得性和外部核验覆盖范围。它用于帮助读者识别证据状态，不构成事实定论。',
};

async function main() {
  await mkdir(output, { recursive: true });
  const audit = {
    id: 'word-smoke-001', title: '台风影响与应急响应的新闻叙事示例', source: 'Example Newsroom', publishedAt: '2026-07-16T09:00:00Z',
    newsSummary: '报道描述台风登陆后的疏散、交通中断与救援安排，并引用官方通报与居民说法。文中说明了受影响地区和部分应对措施，但没有完整披露损失统计与数据口径。',
    originalContent: `${'这是用于 Word 排版核验的新闻原文示例。它不代表真实新闻或事实结论。正文用于检查中文字体、长段落、页眉页脚和附录分页是否正常显示。'.repeat(360)}`,
    modelName: 'DeepSeek V4 Pro', reasoningDepth: 'high', reportLanguage: 'zh-CN', createdAt: new Date('2026-07-17T10:00:00Z'), reportVersion: 3,
    completionMarkdown: 'AI 补全内容示例：应将已核验的事实与待核验的判断明确区分。', auditResultJson: JSON.stringify(report),
  };
  const docx = await renderProfessionalWord(audit);
  const chineseFile = path.join(output, 'guanyu-professional-zh.docx');
  await writeFile(chineseFile, docx);
  console.log(`${chineseFile}: ${docx.byteLength} bytes`);

  const englishAudit = {
    ...audit,
    id: 'word-smoke-002',
    title: 'A narrative review of typhoon impacts and emergency response',
    source: 'Example Newsroom',
    newsSummary: 'The article describes evacuations, transport disruption, and relief arrangements after landfall. It cites official notices and resident accounts, but does not fully disclose loss statistics or the underlying counting method.',
    originalContent: `${'This source text is used only to check professional Word layout, page headers, footers, and appendix pagination. It does not represent a real news event or conclusion. '.repeat(360)}`,
    reportLanguage: 'en-US',
    completionMarkdown: 'AI completion sample: distinguish verified facts from judgments that still require verification.',
    auditResultJson: JSON.stringify({
      methodology: 'Guanyu Nine-Lens Reading',
      sourceInterpretation: { whatItSays: 'The article describes evacuation, disruption, and relief arrangements after landfall.', coreClaims: ['The evacuation scale indicates an effective response.'], keyEvidence: ['Official evacuation and transport figures.'], narrativeStyle: 'The article foregrounds response capacity and provides less detail about loss methodology.' },
      oneSentenceConclusion: 'The event outline is clear, but loss figures and independent corroboration still require verification.',
      scores: { credibility: 68, informationCompleteness: 51, narrativeBias: 43, evidenceStrength: 57, speculationRisk: 35 },
      keyFindings: [{ title: 'Official data is the principal source', description: 'Several material figures come from a single official statement.', evidenceGrade: 'C', verificationStatus: 'partially_supported' }],
      supportingEvidence: [{ content: 'Landfall timing and location can be cross-checked against meteorological records.', supportsNarrative: 'Supports the core account that landfall triggered an emergency response.', evidenceGrade: 'B', verificationStatus: 'partially_supported' }],
      informationGaps: [{ title: 'Loss estimation method', description: 'The article does not state the counting scope or aggregation method.', evidenceGrade: 'D', verificationStatus: 'pending_verification', nextVerification: 'Review primary emergency-management statistical tables.' }],
      stakeholderRelations: [{ role: 'Local emergency-management authorities', possibleBenefit: 'Timely releases can clarify response arrangements.', possibleCost: 'Opaque counting methods may prevent public assessment of actual outcomes.', judgmentType: 'Reasonable inference from the article', speculationRisk: 'Medium' }],
      alternativeExplanations: [{ explanation: 'Evacuation totals may depend on changing counting rules.', currentEvidenceStatus: 'The available material does not disclose the counting method or revision history.', speculationRisk: 'Medium', neededVerification: 'Review primary notices and independent assessments.' }],
      verificationRoadmap: [{ question: 'Where is the original table for official loss statistics?', materialType: 'Primary document', whyItMatters: 'It is needed for comparing counting methods.', priority: 'High' }],
      questionsToAsk: ['Does the count cover every affected area?', 'Is there an independent loss assessment?'],
      onlineVerification: { verifiedSources: [{ title: 'Example public weather and emergency source', url: 'https://example.com/official-source', snippet: 'Useful for checking landfall timing and location.', evidenceGrade: 'B', verificationStatus: 'partially_supported' }] },
      riskNotice: 'This report is limited by the availability of public material and the scope of external verification. It is not a factual verdict.',
    }),
  };
  const englishDocx = await renderProfessionalWord(englishAudit);
  const englishFile = path.join(output, 'guanyu-professional-en.docx');
  await writeFile(englishFile, englishDocx);
  console.log(`${englishFile}: ${englishDocx.byteLength} bytes`);
}

void main();

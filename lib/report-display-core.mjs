const REPORT_TEXT = {
  'zh-CN': {
    sourceInterpretation: '1. 原文解读',
    whatItSays: '原文在讲什么',
    coreClaims: '核心主张',
    mainActors: '主要主体',
    keyEvidence: '原文关键证据',
    narrativeStyle: '叙事方式',
    readerImpression: '读者最可能带走的印象',
    readingValue: '2. 阅读价值判断',
    readerGuide: '3. 给普通读者的读法',
    oneSentence: '4. 一句话观隅审视',
    coreScores: '5. 核心指数',
    scoreDisclaimer: '评分不等于判断新闻真假',
    credibility: '可信度',
    informationCompleteness: '信息完整度',
    narrativeBias: '叙事倾向性',
    evidenceStrength: '证据强度',
    speculationUncertainty: '推测不确定性',
    scoreHelpCredibility: '越高表示越可信',
    scoreHelpCompleteness: '越高表示信息越完整',
    scoreHelpBias: '越高表示引导性越强',
    scoreHelpEvidence: '越高表示证据越充分',
    scoreHelpRisk: '越高表示越需要谨慎核验',
    conclusionLayers: '6. 结论分层',
    confirmed: '可以确认',
    reasonableDoubts: '可以合理怀疑',
    cannotJudge: '暂不能判断',
    findings: '7. 最关键的 3 个发现',
    supportingEvidence: '8. 支持原文叙事的证据',
    informationGaps: '9. 主要信息缺口',
    interests: '10. 关键利益关系',
    alternatives: '11. 替代解释对照',
    evidenceStatus: '12. 证据与核验状态',
    strongestEvidence: '最强证据',
    weakestEvidence: '最弱证据',
    sourceSupported: '仅由原文支持',
    externallyVerified: '外部已核验',
    pendingExternalVerification: '待外部核验',
    unableToVerify: '暂无法确认',
    insufficientMaterial: '当前材料不足，无法形成可靠判断。',
    roadmap: '13. 验证路线图',
    materialType: '材料类型',
    priority: '优先级',
    webVerification: '联网核验结果',
    verifiedSources: '已核验来源',
    backgroundSources: '相关背景来源',
    pendingLeads: '待核验线索',
    noReliableItems: '当前无可靠条目。',
    noReliableSources: '未找到可用于外部核验的可靠来源。',
    questions: '14. 继续追问清单',
    notConcluded: '15. 目前不能直接得出的结论',
    riskNotice: '16. 风险提示',
    meta: '17. 报告元信息',
    articleTitle: '新闻标题',
    articleSource: '新闻来源',
    publishedAt: '发布时间',
    modelName: '使用模型',
    thinkingDepth: '思考强度',
    reportLanguage: '报告语言',
    analysisMode: '分析模式',
    createdAt: '生成时间',
    methodology: '方法论',
    articleOriginal: '新闻原文',
    showOriginal: '查看原文',
    hideOriginal: '收起原文',
    originalCollapsed: '完整原文默认折叠，只在需要核对模型引用和上下文时展开。',
    importance: '重要性',
    verificationPath: '验证路径',
    limitation: '局限',
    possibleBenefit: '可能利益',
    possibleCost: '可能代价',
    currentEvidence: '当前证据',
    needsVerification: '需验证',
    exportMarkdown: '导出完整 Markdown',
    aiCompletion: 'AI 补全',
    generatingCompletion: 'AI 补全中...',
    completionPreview: 'AI 补全新闻稿（Markdown）',
    downloadCompletion: '下载补全稿',
    completionFailed: 'AI 补全暂时无法完成。',
    beneficiaries: '可能受益方',
    costBearers: '成本承担方',
    missingPerspectives: '缺席视角',
    alternativeExplanations: '替代解释',
    present: '已呈现',
    weak: '弱呈现',
    missing: '缺席',
    decisionMaker: '决策者',
    silentParty: '沉默者',
    intermediary: '中介者',
    noItems: '暂无条目',
    chartCoreMetrics: '核心指数',
    chartStructureScore: '报道结构与证据状态',
    chartElementCounts: '审视要素数量',
    chartCoverage: '覆盖情况',
    chartEvidenceDistribution: '证据等级分布',
    chartEvidenceNote: 'A 强、E 弱',
    chartMissingStatus: '缺席视角状态',
    chartCoverageLevel: '呈现程度',
    chartInterestCost: '利益—代价关系',
    chartInterestCostNote: '角色数量与代表主体',
  },
  'en-US': {
    sourceInterpretation: '1. Reading the article',
    whatItSays: 'What the article says',
    coreClaims: 'Core claims',
    mainActors: 'Main actors',
    keyEvidence: 'Key evidence in the article',
    narrativeStyle: 'Narrative style',
    readerImpression: 'Likely reader takeaway',
    readingValue: '2. Reading value',
    readerGuide: '3. How a general reader can approach it',
    oneSentence: '4. One-sentence Guanyu view',
    coreScores: '5. Core indicators',
    scoreDisclaimer: 'Scores do not determine whether a news report is true or false',
    credibility: 'Credibility',
    informationCompleteness: 'Information completeness',
    narrativeBias: 'Narrative steering',
    evidenceStrength: 'Evidence strength',
    speculationUncertainty: 'Speculation uncertainty',
    scoreHelpCredibility: 'Higher means more credible',
    scoreHelpCompleteness: 'Higher means more complete information',
    scoreHelpBias: 'Higher means stronger framing',
    scoreHelpEvidence: 'Higher means stronger evidence',
    scoreHelpRisk: 'Higher means more verification is needed',
    conclusionLayers: '6. Layers of conclusion',
    confirmed: 'Can be confirmed',
    reasonableDoubts: 'Reasonable doubts',
    cannotJudge: 'Cannot yet be determined',
    findings: '7. Three key findings',
    supportingEvidence: '8. Evidence supporting the article narrative',
    informationGaps: '9. Major information gaps',
    interests: '10. Key interest relationships',
    alternatives: '11. Alternative explanations',
    evidenceStatus: '12. Evidence and verification state',
    strongestEvidence: 'Strongest evidence',
    weakestEvidence: 'Weakest evidence',
    sourceSupported: 'Supported by the article only',
    externallyVerified: 'Externally verified',
    pendingExternalVerification: 'Needs external verification',
    unableToVerify: 'Unable to verify',
    insufficientMaterial: 'The available material is insufficient for a reliable judgment.',
    roadmap: '13. Verification roadmap',
    materialType: 'Material type',
    priority: 'Priority',
    webVerification: 'Web verification results',
    verifiedSources: 'Verified sources',
    backgroundSources: 'Background sources',
    pendingLeads: 'Leads to verify',
    noReliableItems: 'No reliable item is available.',
    noReliableSources: 'No reliable source was found for external verification.',
    questions: '14. Questions to ask next',
    notConcluded: '15. Conclusions not yet supported',
    riskNotice: '16. Interpretation boundary',
    meta: '17. Report metadata',
    articleTitle: 'Article title',
    articleSource: 'Article source',
    publishedAt: 'Published at',
    modelName: 'Model',
    thinkingDepth: 'Reasoning depth',
    reportLanguage: 'Report language',
    analysisMode: 'Analysis mode',
    createdAt: 'Generated at',
    methodology: 'Methodology',
    articleOriginal: 'Original article',
    showOriginal: 'Show article',
    hideOriginal: 'Hide article',
    originalCollapsed: 'The original article is collapsed by default. Open it only when you need to check quotations or context.',
    importance: 'Why it matters',
    verificationPath: 'Verification path',
    limitation: 'Limitation',
    possibleBenefit: 'Possible benefit',
    possibleCost: 'Possible cost',
    currentEvidence: 'Current evidence',
    needsVerification: 'Needs verification',
    exportMarkdown: 'Export complete Markdown',
    aiCompletion: 'AI completion',
    generatingCompletion: 'Completing with AI...',
    completionPreview: 'AI completed article (Markdown)',
    downloadCompletion: 'Download completion',
    completionFailed: 'AI completion could not be completed right now.',
    beneficiaries: 'Potential beneficiaries',
    costBearers: 'Cost bearers',
    missingPerspectives: 'Missing perspectives',
    alternativeExplanations: 'Alternative explanations',
    present: 'Present',
    weak: 'Weakly represented',
    missing: 'Missing',
    decisionMaker: 'Decision makers',
    silentParty: 'Silent parties',
    intermediary: 'Intermediaries',
    noItems: 'No items',
    chartCoreMetrics: 'Core indicators',
    chartStructureScore: 'Report structure and evidence state',
    chartElementCounts: 'Review element counts',
    chartCoverage: 'Coverage',
    chartEvidenceDistribution: 'Evidence-grade distribution',
    chartEvidenceNote: 'A strongest, E weakest',
    chartMissingStatus: 'Missing-perspective status',
    chartCoverageLevel: 'Representation level',
    chartInterestCost: 'Interest-cost relationships',
    chartInterestCostNote: 'Role counts and representative actors',
  },
};

const REPORT_TEXT_LOCALIZED = {
  'zh-TW': {
    sourceInterpretation: '1. 原文解讀', whatItSays: '原文在講什麼', coreClaims: '核心主張', mainActors: '主要主體', keyEvidence: '原文關鍵證據', narrativeStyle: '敘事方式', readerImpression: '讀者最可能帶走的印象',
    readingValue: '2. 閱讀價值判斷', readerGuide: '3. 給一般讀者的讀法', oneSentence: '4. 一句話觀隅審視', coreScores: '5. 核心指數', scoreDisclaimer: '評分不等於判斷新聞真假',
    conclusionLayers: '6. 結論分層', findings: '7. 三個關鍵發現', supportingEvidence: '8. 支持原文敘事的證據', informationGaps: '9. 主要資訊缺口', interests: '10. 關鍵利益關係', alternatives: '11. 替代解釋對照', evidenceStatus: '12. 證據與核驗狀態', roadmap: '13. 核驗路線圖', webVerification: '網路核驗結果', questions: '14. 繼續追問清單', notConcluded: '15. 目前不能直接得出的結論', riskNotice: '16. 解讀邊界', meta: '17. 報告資訊',
    articleTitle: '新聞標題', articleSource: '新聞來源', publishedAt: '發布時間', modelName: '使用模型', thinkingDepth: '思考強度', reportLanguage: '報告語言', createdAt: '生成時間', articleOriginal: '新聞原文', showOriginal: '查看原文', hideOriginal: '收起原文', exportMarkdown: '匯出完整 Markdown',
  },
  'ja-JP': {
    sourceInterpretation: '1. 記事の読み解き', whatItSays: '記事が伝えていること', coreClaims: '中心的な主張', mainActors: '主な当事者', keyEvidence: '記事内の主要な根拠', narrativeStyle: '叙述の特徴', readerImpression: '読者が受け取りやすい印象',
    readingValue: '2. 読む価値', readerGuide: '3. 一般読者の読み方', oneSentence: '4. 一文での視点', coreScores: '5. 主要指標', scoreDisclaimer: '指標はニュースの真偽を判定するものではありません',
    conclusionLayers: '6. 結論の層', findings: '7. 三つの重要な発見', supportingEvidence: '8. 記事の叙述を支える根拠', informationGaps: '9. 主な情報の欠落', interests: '10. 主要な利害関係', alternatives: '11. 代替的な説明', evidenceStatus: '12. 根拠と検証状況', roadmap: '13. 検証ロードマップ', webVerification: 'ウェブ検証の結果', questions: '14. 次に問うべきこと', notConcluded: '15. 現時点で結論づけられないこと', riskNotice: '16. 解釈上の留意点', meta: '17. レポート情報',
    articleTitle: '記事タイトル', articleSource: '情報源', publishedAt: '公開日時', modelName: 'モデル', thinkingDepth: '推論の深さ', reportLanguage: 'レポート言語', createdAt: '生成日時', articleOriginal: '記事本文', showOriginal: '本文を表示', hideOriginal: '本文を閉じる', exportMarkdown: '完全な Markdown を出力',
  },
  'ko-KR': {
    sourceInterpretation: '1. 원문 해석', whatItSays: '원문이 말하는 내용', coreClaims: '핵심 주장', mainActors: '주요 주체', keyEvidence: '원문의 핵심 근거', narrativeStyle: '서사 방식', readerImpression: '독자가 받기 쉬운 인상',
    readingValue: '2. 읽을 가치', readerGuide: '3. 일반 독자를 위한 읽는 법', oneSentence: '4. 한 문장 분석', coreScores: '5. 핵심 지표', scoreDisclaimer: '점수는 뉴스의 진위를 판정하지 않습니다',
    conclusionLayers: '6. 결론의 층위', findings: '7. 세 가지 핵심 발견', supportingEvidence: '8. 기사 서사를 뒷받침하는 근거', informationGaps: '9. 주요 정보 공백', interests: '10. 핵심 이해관계', alternatives: '11. 대안적 설명', evidenceStatus: '12. 근거 및 검증 상태', roadmap: '13. 검증 로드맵', webVerification: '웹 검증 결과', questions: '14. 다음 질문', notConcluded: '15. 현재 도출할 수 없는 결론', riskNotice: '16. 해석 경계', meta: '17. 보고서 정보',
    articleTitle: '기사 제목', articleSource: '출처', publishedAt: '발행 시각', modelName: '모델', thinkingDepth: '사고 강도', reportLanguage: '보고서 언어', createdAt: '생성 시각', articleOriginal: '원문 기사', showOriginal: '원문 보기', hideOriginal: '원문 접기', exportMarkdown: '전체 Markdown 내보내기',
  },
  'de-DE': {
    sourceInterpretation: '1. Artikel lesen', whatItSays: 'Was der Artikel sagt', coreClaims: 'Kernbehauptungen', mainActors: 'Hauptakteure', keyEvidence: 'Zentrale Belege im Artikel', narrativeStyle: 'Erzaehlweise', readerImpression: 'Wahrscheinlicher Eindruck beim Lesen',
    readingValue: '2. Lesewert', readerGuide: '3. Lesart fuer allgemeine Leser', oneSentence: '4. Ein-Satz-Perspektive', coreScores: '5. Kernindikatoren', scoreDisclaimer: 'Die Werte entscheiden nicht ueber wahr oder falsch',
    conclusionLayers: '6. Ebenen der Schlussfolgerung', findings: '7. Drei Schluesselfeststellungen', supportingEvidence: '8. Belege fuer die Artikelhandlung', informationGaps: '9. Wesentliche Informationsluecken', interests: '10. Zentrale Interessenbeziehungen', alternatives: '11. Alternative Erklaerungen', evidenceStatus: '12. Beleg- und Pruefstatus', roadmap: '13. Pruefplan', webVerification: 'Ergebnisse der Webpruefung', questions: '14. Weiterfuehrende Fragen', notConcluded: '15. Noch nicht belegte Schlussfolgerungen', riskNotice: '16. Auslegungsgrenze', meta: '17. Berichtsdaten',
    articleTitle: 'Artikeltitel', articleSource: 'Quelle', publishedAt: 'Veroeffentlicht', modelName: 'Modell', thinkingDepth: 'Denkintensitaet', reportLanguage: 'Berichtssprache', createdAt: 'Erstellt am', articleOriginal: 'Originalartikel', showOriginal: 'Artikel zeigen', hideOriginal: 'Artikel ausblenden', exportMarkdown: 'Vollstaendiges Markdown exportieren',
  },
  'it-IT': {
    sourceInterpretation: '1. Lettura dell\'articolo', whatItSays: 'Cosa dice l\'articolo', coreClaims: 'Tesi principali', mainActors: 'Soggetti principali', keyEvidence: 'Evidenze chiave nell\'articolo', narrativeStyle: 'Impostazione narrativa', readerImpression: 'Impressione probabile per il lettore',
    readingValue: '2. Valore di lettura', readerGuide: '3. Come leggerlo da lettori comuni', oneSentence: '4. Punto di vista in una frase', coreScores: '5. Indicatori principali', scoreDisclaimer: 'I punteggi non stabiliscono se la notizia e vera o falsa',
    conclusionLayers: '6. Livelli della conclusione', findings: '7. Tre scoperte chiave', supportingEvidence: '8. Evidenze a sostegno della narrazione', informationGaps: '9. Principali lacune informative', interests: '10. Relazioni di interesse chiave', alternatives: '11. Spiegazioni alternative', evidenceStatus: '12. Evidenze e stato di verifica', roadmap: '13. Percorso di verifica', webVerification: 'Risultati della verifica sul web', questions: '14. Domande successive', notConcluded: '15. Conclusioni non ancora sostenute', riskNotice: '16. Limite interpretativo', meta: '17. Metadati del rapporto',
    articleTitle: 'Titolo', articleSource: 'Fonte', publishedAt: 'Pubblicato il', modelName: 'Modello', thinkingDepth: 'Intensita di ragionamento', reportLanguage: 'Lingua del rapporto', createdAt: 'Generato il', articleOriginal: 'Articolo originale', showOriginal: 'Mostra articolo', hideOriginal: 'Nascondi articolo', exportMarkdown: 'Esporta Markdown completo',
  },
};

const JUDGMENT_TYPES = {
  '原文明确事实': ['原文明确事实', 'Explicit fact in the article'],
  '基于原文的合理推断': ['基于原文的合理推断', 'Reasonable inference from the article'],
  '待外部验证的假设': ['待外部验证的假设', 'Hypothesis requiring external verification'],
};

const LOCALIZED_LABELS = {
  'zh-TW': {
    judgmentTypes: { '原文明确事实': '原文明確事實', '基于原文的合理推断': '基於原文的合理推斷', '待外部验证的假设': '待外部核驗的假設' },
    verification: { source_supported: '原文支持', externally_verified: '外部已核驗', partially_supported: '部分支持', pending_verification: '待核驗', unable_to_verify: '暫無法確認' },
    evidence: '證據', uncertainty: '推測不確定性', priority: '優先級', plausibility: '合理性', unknown: '未知', risk: { 高: '高', 中: '中', 低: '低' },
    material: { '原始文件': '原始文件', '数据': '資料', '专家意见': '專家意見', '当事方回应': '當事方回應', '多源报道': '多源報導', '法律法规': '法律法規', '行业标准': '產業標準' },
    depth: { none: '無', low: '低', medium: '中', high: '高', extreme: '極高' }, modes: { quick: '歷史快速分析', deep: '觀隅分析' },
  },
  'ja-JP': {
    judgmentTypes: { '原文明确事实': '記事に明示された事実', '基于原文的合理推断': '記事に基づく妥当な推論', '待外部验证的假设': '外部検証が必要な仮説' },
    verification: { source_supported: '記事本文のみで裏付け', externally_verified: '外部で検証済み', partially_supported: '一部裏付けあり', pending_verification: '要検証', unable_to_verify: '確認できない' },
    evidence: '根拠', uncertainty: '推測の不確実性', priority: '優先度', plausibility: '妥当性', unknown: '不明', risk: { 高: '高', 中: '中', 低: '低' },
    material: { '原始文件': '一次資料', '数据': 'データ', '专家意见': '専門家の見解', '当事方回应': '当事者の回答', '多源报道': '複数報道', '法律法规': '法令', '行业标准': '業界標準' },
    depth: { none: 'なし', low: '低', medium: '中', high: '高', extreme: '最高' }, modes: { quick: '旧クイック分析', deep: 'ニュースの死角分析' },
  },
  'ko-KR': {
    judgmentTypes: { '原文明确事实': '원문에 명시된 사실', '基于原文的合理推断': '원문에 근거한 합리적 추론', '待外部验证的假设': '외부 검증이 필요한 가설' },
    verification: { source_supported: '원문만으로 뒷받침됨', externally_verified: '외부 검증 완료', partially_supported: '부분적으로 뒷받침됨', pending_verification: '검증 필요', unable_to_verify: '확인할 수 없음' },
    evidence: '근거', uncertainty: '추정의 불확실성', priority: '우선순위', plausibility: '개연성', unknown: '알 수 없음', risk: { 高: '높음', 中: '중간', 低: '낮음' },
    material: { '原始文件': '원문 자료', '数据': '데이터', '专家意见': '전문가 의견', '当事方回应': '당사자 응답', '多源报道': '복수 출처 보도', '法律法规': '법령', '行业标准': '업계 표준' },
    depth: { none: '없음', low: '낮음', medium: '중간', high: '높음', extreme: '매우 높음' }, modes: { quick: '기존 빠른 분석', deep: '뉴스의 사각 분석' },
  },
  'de-DE': {
    judgmentTypes: { '原文明确事实': 'Ausdrueckliche Tatsache im Artikel', '基于原文的合理推断': 'Plausible Schlussfolgerung aus dem Artikel', '待外部验证的假设': 'Hypothese mit externem Pruefbedarf' },
    verification: { source_supported: 'Nur durch den Artikel gestuetzt', externally_verified: 'Extern verifiziert', partially_supported: 'Teilweise gestuetzt', pending_verification: 'Zu pruefen', unable_to_verify: 'Nicht verifizierbar' },
    evidence: 'Beleg', uncertainty: 'Unsicherheit der Vermutung', priority: 'Prioritaet', plausibility: 'Plausibilitaet', unknown: 'Unbekannt', risk: { 高: 'hoch', 中: 'mittel', 低: 'niedrig' },
    material: { '原始文件': 'Primaerquelle', '数据': 'Daten', '专家意见': 'Expertenmeinung', '当事方回应': 'Stellungnahme einer beteiligten Partei', '多源报道': 'Mehrquellen-Berichterstattung', '法律法规': 'Gesetze und Vorschriften', '行业标准': 'Branchenstandard' },
    depth: { none: 'Keine', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', extreme: 'Sehr hoch' }, modes: { quick: 'Fruehere Kurzanalyse', deep: 'Nachrichtenwinkel-Analyse' },
  },
  'it-IT': {
    judgmentTypes: { '原文明确事实': 'Fatto esplicito nell articolo', '基于原文的合理推断': 'Inferenza ragionevole dall articolo', '待外部验证的假设': 'Ipotesi da verificare esternamente' },
    verification: { source_supported: 'Supportato solo dall articolo', externally_verified: 'Verificato esternamente', partially_supported: 'Parzialmente supportato', pending_verification: 'Da verificare', unable_to_verify: 'Non verificabile' },
    evidence: 'Evidenza', uncertainty: 'Incertezza della supposizione', priority: 'Priorita', plausibility: 'Plausibilita', unknown: 'Sconosciuto', risk: { 高: 'alta', 中: 'media', 低: 'bassa' },
    material: { '原始文件': 'Fonte primaria', '数据': 'Dati', '专家意见': 'Parere di esperto', '当事方回应': 'Risposta della parte coinvolta', '多源报道': 'Notizie da piu fonti', '法律法规': 'Leggi e regolamenti', '行业标准': 'Standard di settore' },
    depth: { none: 'Nessuna', low: 'Bassa', medium: 'Media', high: 'Alta', extreme: 'Molto alta' }, modes: { quick: 'Analisi rapida precedente', deep: 'Analisi Angolo Notizie' },
  },
};

const VERIFICATION_STATUSES = {
  source_supported: ['原文支持', 'Supported by the article'],
  externally_verified: ['外部已核验', 'Externally verified'],
  partially_supported: ['部分支持', 'Partially supported'],
  pending_verification: ['待核验', 'Needs verification'],
  unable_to_verify: ['暂无法确认', 'Unable to verify'],
};

const MATERIAL_TYPES = {
  '原始文件': ['原始文件', 'Primary documents'],
  '数据': ['数据', 'Data'],
  '专家意见': ['专家意见', 'Expert opinion'],
  '当事方回应': ['当事方回应', 'Response from involved party'],
  '多源报道': ['多源报道', 'Multiple-source reporting'],
  '法律法规': ['法律法规', 'Laws and regulations'],
  '行业标准': ['行业标准', 'Industry standards'],
};

const DEPTHS = {
  none: ['无', 'None'],
  low: ['低', 'Low'],
  medium: ['中', 'Medium'],
  high: ['高', 'High'],
  extreme: ['极高', 'Very high'],
};

const PUBLISHED_AT_SOURCES = {
  ai_assessed: ['模型判断', 'Model assessment'],
  user_input: ['用户填写', 'User input'],
  json_ld: ['JSON-LD', 'JSON-LD'],
  meta_article: ['article meta', 'Article metadata'],
  meta_og: ['OG meta', 'Open Graph metadata'],
  meta_pubdate: ['pubdate meta', 'Publication-date metadata'],
  time_tag: ['time 标签', 'Time element'],
  body_people_daily_format: ['正文人民日报版面日期', 'People’s Daily page-date format'],
  body_regex: ['正文日期匹配', 'Article-text date match'],
  unknown: ['未知', 'Unknown'],
};

function isEnglish(language) {
  return language !== 'zh-CN' && language !== 'zh-TW';
}

function mappedLabel(map, value, language, fallback = '') {
  const tuple = map[value];
  if (tuple) return tuple[isEnglish(language) ? 1 : 0];
  return fallback || String(value || '');
}

function localizedLabel(language, group, value, fallback) {
  const localized = LOCALIZED_LABELS[language]?.[group]?.[value];
  return localized || fallback;
}

export function getReportText(key, language = 'zh-CN') {
  if (language === 'zh-CN' || language === 'en-US') return REPORT_TEXT[language][key] || key;
  return REPORT_TEXT_LOCALIZED[language]?.[key] || REPORT_TEXT['en-US'][key] || key;
}

export function formatJudgmentType(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) return localizedLabel(language, 'judgmentTypes', value, String(value || ''));
  return mappedLabel(JUDGMENT_TYPES, value, language);
}

export function formatVerificationStatus(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) return localizedLabel(language, 'verification', value, String(value || ''));
  return mappedLabel(VERIFICATION_STATUSES, value, language);
}

export function formatEvidenceGrade(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) return `${LOCALIZED_LABELS[language].evidence} ${value || '—'}`;
  return isEnglish(language) ? `Evidence ${value || '—'}` : `证据 ${value || '—'}`;
}

export function formatSpeculationRisk(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) {
    const level = localizedLabel(language, 'risk', value, mappedLabel({ 高: ['高', 'high'], 中: ['中', 'medium'], 低: ['低', 'low'] }, value, 'en-US', LOCALIZED_LABELS[language].unknown));
    return `${LOCALIZED_LABELS[language].uncertainty}: ${level}`;
  }
  const level = mappedLabel({ 高: ['高', 'high'], 中: ['中', 'medium'], 低: ['低', 'low'] }, value, language, isEnglish(language) ? 'unknown' : '未知');
  return isEnglish(language) ? `Uncertainty: ${level}` : `推测不确定性 ${level}`;
}

export function formatMaterialType(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) return localizedLabel(language, 'material', value, String(value || ''));
  return mappedLabel(MATERIAL_TYPES, value, language);
}

export function formatPriority(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) {
    const level = localizedLabel(language, 'risk', value, mappedLabel({ 高: ['高', 'high'], 中: ['中', 'medium'], 低: ['低', 'low'] }, value, 'en-US', LOCALIZED_LABELS[language].unknown));
    return `${LOCALIZED_LABELS[language].priority}: ${level}`;
  }
  const level = mappedLabel({ 高: ['高', 'high'], 中: ['中', 'medium'], 低: ['低', 'low'] }, value, language, isEnglish(language) ? 'unknown' : '未知');
  return isEnglish(language) ? `Priority: ${level}` : `优先级 ${level}`;
}

export function formatReasonableness(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) {
    const level = localizedLabel(language, 'risk', value, mappedLabel({ 高: ['高', 'high'], 中: ['中', 'medium'], 低: ['低', 'low'] }, value, 'en-US', LOCALIZED_LABELS[language].unknown));
    return `${LOCALIZED_LABELS[language].plausibility}: ${level}`;
  }
  const level = mappedLabel({ 高: ['高', 'high'], 中: ['中', 'medium'], 低: ['低', 'low'] }, value, language, isEnglish(language) ? 'unknown' : '未知');
  return isEnglish(language) ? `Plausibility: ${level}` : `合理性：${level}`;
}

export function formatThinkingDepth(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) return localizedLabel(language, 'depth', value, String(value || ''));
  return mappedLabel(DEPTHS, value, language);
}

export function formatAnalysisMode(value, language = 'zh-CN') {
  if (LOCALIZED_LABELS[language]) return localizedLabel(language, 'modes', value, String(value || ''));
  if (value === 'quick') return isEnglish(language) ? 'Legacy quick analysis' : '历史快速分析';
  if (value === 'deep') return isEnglish(language) ? 'Guanyu analysis' : '观隅分析';
  return String(value || '');
}

export function formatPublishedAtSource(value, language = 'zh-CN') {
  return mappedLabel(PUBLISHED_AT_SOURCES, value, language);
}

export function formatConfidence(value, language = 'zh-CN') {
  return mappedLabel({ high: ['高', 'High'], medium: ['中', 'Medium'], low: ['低', 'Low'], unknown: ['未知', 'Unknown'] }, value, language);
}

export function formatUnconfirmedItem(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const title = [value.title, value.claim, value.subject, value.item, value.question, value.name]
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .find(Boolean) || '';
  const detail = [value.reason, value.note, value.detail, value.description, value.content, value.why]
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .find(Boolean) || '';
  if (title && detail) return `${title}: ${detail}`;
  return title || detail;
}

export function getReadWorthAnimationTokens(label, language = 'zh-CN') {
  const text = String(label || '').trim();
  if (!text) return [];
  if (String(language).startsWith('zh-')) return Array.from(text).reduce((tokens, character, index) => {
    const targetIndex = Math.floor(index / 2);
    tokens[targetIndex] = `${tokens[targetIndex] || ''}${character}`;
    return tokens;
  }, []);
  return text.split(/\s+/).filter(Boolean);
}

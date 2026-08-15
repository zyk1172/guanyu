import { getBrandIdentity } from './brand-core.mjs';
import { getReportText } from './report-display-core.mjs';

export const EXPORT_LANGUAGES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'it-IT'];

const INDEX = { 'zh-TW': 0, 'ja-JP': 1, 'ko-KR': 2, 'de-DE': 3, 'it-IT': 4 };

const REPORT_KEYS = {
  'What the article says': 'whatItSays',
  'Core claims': 'coreClaims',
  'Main actors': 'mainActors',
  'Key evidence in the article': 'keyEvidence',
  'Narrative style': 'narrativeStyle',
  'Likely reader takeaway': 'readerImpression',
  'Credibility': 'credibility',
  'Information completeness': 'informationCompleteness',
  'Evidence strength': 'evidenceStrength',
  'Speculation uncertainty': 'speculationUncertainty',
  'Can be confirmed': 'confirmed',
  'Reasonable doubts': 'reasonableDoubts',
  'Cannot yet be determined': 'cannotJudge',
  'Strongest evidence': 'strongestEvidence',
  'Weakest evidence': 'weakestEvidence',
  'Supported by the article only': 'sourceSupported',
  'Externally verified': 'externallyVerified',
  'Needs external verification': 'pendingExternalVerification',
  'Unable to verify': 'unableToVerify',
  'Verified sources': 'verifiedSources',
  'Background sources': 'backgroundSources',
  'Leads to verify': 'pendingLeads',
  'Article title': 'articleTitle',
  'Published at': 'publishedAt',
  'Model': 'modelName',
  'Reasoning depth': 'thinkingDepth',
  'Report language': 'reportLanguage',
  'Generated at': 'createdAt',
  'Methodology': 'methodology',
  'Why it matters': 'importance',
  'Verification path': 'verificationPath',
  'Limitation': 'limitation',
  'Potential benefit': 'possibleBenefit',
  'Potential cost': 'possibleCost',
  'Current evidence': 'currentEvidence',
  'Required verification': 'needsVerification',
  'Material type': 'materialType',
  'Priority': 'priority',
};

// Order: Traditional Chinese, Japanese, Korean, German, Italian.
const PHRASES = {
  'News Narrative Review Report': ['新聞敘事審視報告', 'ニュース叙事検証レポート', '뉴스 서사 검토 보고서', 'Bericht zur Nachrichten-Narrativanalyse', 'Rapporto di analisi della narrazione giornalistica'],
  'Document control': ['文件控制', '文書管理', '문서 관리', 'Dokumentenkontrolle', 'Controllo del documento'],
  'Table of contents': ['目錄', '目次', '목차', 'Inhaltsverzeichnis', 'Indice'],
  'Contents': ['目錄', '目次', '목차', 'Inhalt', 'Indice'],
  'Executive summary': ['執行摘要', 'エグゼクティブサマリー', '요약 보고', 'Zusammenfassung', 'Sintesi esecutiva'],
  'News event and original claims': ['新聞事件與原始主張', 'ニュース事象と原記事の主張', '뉴스 사건과 원문의 주장', 'Nachrichtenereignis und ursprüngliche Behauptungen', 'Evento giornalistico e affermazioni originali'],
  'Evidence assessment': ['證據評估', '証拠評価', '근거 평가', 'Beweisbewertung', 'Valutazione delle evidenze'],
  'Narrative structure and framing': ['敘事結構與框架分析', '叙事構造とフレーミング分析', '서사 구조와 프레이밍 분석', 'Narrativstruktur und Framing', 'Struttura narrativa e inquadramento'],
  'Risk and uncertainty': ['風險與不確定性', 'リスクと不確実性', '위험과 불확실성', 'Risiken und Unsicherheiten', 'Rischi e incertezze'],
  'Verification roadmap': ['核驗路線圖', '検証ロードマップ', '검증 로드맵', 'Prüfplan', 'Percorso di verifica'],
  'AI supplementary analysis': ['AI 補充分析', 'AI補足分析', 'AI 보충 분석', 'Ergänzende KI-Analyse', 'Analisi integrativa AI'],
  'AI follow-up record': ['AI 追問記錄', 'AI追加質問の記録', 'AI 후속 질문 기록', 'KI-Nachfragen', 'Registro delle domande AI'],
  'Sources and references': ['來源與引用', '情報源と参考文献', '출처 및 참고문헌', 'Quellen und Verweise', 'Fonti e riferimenti'],
  'References': ['參考來源', '参考文献', '참고문헌', 'Quellen', 'Riferimenti'],
  'Reference': ['參考來源', '参照元', '참고 출처', 'Referenz', 'Riferimento'],
  'Method note': ['方法說明', '方法注記', '방법론 설명', 'Methodenhinweis', 'Nota metodologica'],
  'Appendix: original article': ['附錄：新聞原文', '付録：ニュース原文', '부록: 뉴스 원문', 'Anhang: Originalartikel', 'Appendice: articolo originale'],
  'Appendix A: original article': ['附錄 A：新聞原文', '付録A：ニュース原文', '부록 A: 뉴스 원문', 'Anhang A: Originalartikel', 'Appendice A: articolo originale'],
  'Abstract': ['摘要', '要旨', '초록', 'Kurzfassung', 'Abstract'],
  'Core conclusion': ['核心結論', '中心的な結論', '핵심 결론', 'Kernaussage', 'Conclusione principale'],
  'Keywords': ['關鍵詞', 'キーワード', '핵심어', 'Schlüsselwörter', 'Parole chiave'],
  'Item': ['項目', '項目', '항목', 'Punkt', 'Voce'],
  'Information': ['資訊', '情報', '정보', 'Information', 'Informazioni'],
  'Field': ['欄位', 'Feld', '필드', 'Feld', 'Campo'],
  'Content': ['內容', '内容', '내용', 'Inhalt', 'Contenuto'],
  'Report ID': ['報告編號', 'レポートID', '보고서 ID', 'Berichts-ID', 'ID rapporto'],
  'Version': ['版本', 'バージョン', '버전', 'Version', 'Versione'],
  'Report version': ['報告版本', 'レポート版', '보고서 버전', 'Berichtsversion', 'Versione del rapporto'],
  'Language': ['語言', '言語', '언어', 'Sprache', 'Lingua'],
  'Generated': ['生成時間', '生成日時', '생성 시각', 'Erstellt', 'Generato'],
  'Method': ['分析方法', '分析手法', '분석 방법', 'Methode', 'Metodo'],
  'Source': ['來源', '情報源', '출처', 'Quelle', 'Fonte'],
  'Published': ['發布時間', '公開日時', '발행 시각', 'Veröffentlicht', 'Pubblicato'],
  'Not provided': ['未提供', '未提供', '제공되지 않음', 'Nicht angegeben', 'Non fornito'],
  'Not reliably identified': ['未能可靠識別', '信頼できる形で特定できません', '신뢰할 수 있게 확인되지 않음', 'Nicht zuverlässig ermittelt', 'Non identificato in modo affidabile'],
  'One-sentence conclusion': ['一句話結論', '一文の結論', '한 문장 결론', 'Schlussfolgerung in einem Satz', 'Conclusione in una frase'],
  'Core metrics': ['核心指標總覽', '主要指標', '핵심 지표', 'Kernkennzahlen', 'Indicatori principali'],
  'Metric': ['指標', '指標', '지표', 'Kennzahl', 'Indicatore'],
  'Score': ['數值', 'スコア', '점수', 'Wert', 'Punteggio'],
  'Interpretation': ['釋義', '解釈', '해석', 'Einordnung', 'Interpretazione'],
  'Narrative framing': ['敘事傾向性', 'ナラティブの誘導性', '서사 유도성', 'Narrative Lenkung', 'Orientamento narrativo'],
  'Claim': ['核心主張', '主張', '주장', 'Behauptung', 'Affermazione'],
  'Evidence': ['支持證據', '根拠', '근거', 'Beleg', 'Evidenza'],
  'Strength': ['強度', '強度', '강도', 'Stärke', 'Forza'],
  'Current status': ['目前狀態', '現在の状態', '현재 상태', 'Aktueller Status', 'Stato attuale'],
  'Report material': ['報告材料', 'レポート資料', '보고서 자료', 'Berichtsmaterial', 'Materiale del rapporto'],
  'Risk level': ['風險層級', 'リスク水準', '위험 수준', 'Risikostufe', 'Livello di rischio'],
  'Explanation': ['說明', '説明', '설명', 'Erläuterung', 'Spiegazione'],
  'High': ['高', '高', '높음', 'Hoch', 'Alto'],
  'Medium': ['中', '中', '중간', 'Mittel', 'Medio'],
  'Low': ['低', '低', '낮음', 'Niedrig', 'Basso'],
  'Priority verification items': ['優先核驗事項', '優先検証項目', '우선 검증 항목', 'Prioritäre Prüfpunkte', 'Elementi prioritari da verificare'],
  'Questions': ['問題清單', '質問', '질문', 'Fragen', 'Domande'],
  'Assessment rationale': ['判斷理由', '評価理由', '판단 근거', 'Begründung der Bewertung', 'Motivazione della valutazione'],
  'Reading value': ['閱讀價值判斷', '読む価値', '읽을 가치', 'Lesewert', 'Valore di lettura'],
  'How a general reader can approach it': ['給一般讀者的讀法', '一般読者の読み方', '일반 독자를 위한 읽는 법', 'Lesart für allgemeine Leser', 'Come leggerlo da lettori comuni'],
  'One-sentence Guanyu view': ['一句話觀隅審視', '一文での視点', '한 문장 분석', 'Ein-Satz-Perspektive', 'Punto di vista in una frase'],
  'Narrative tendency': ['敘事傾向性', 'ナラティブの誘導性', '서사 유도성', 'Narrative Tendenz', 'Tendenza narrativa'],
  'Information that remains unconfirmed': ['暫無法確認的資訊', '未確認の情報', '확인되지 않은 정보', 'Noch unbestätigte Informationen', 'Informazioni non ancora confermate'],
  'Risk notice': ['風險提示', '留意事項', '주의 사항', 'Risikohinweis', 'Avvertenza sui rischi'],
  'Conclusions not yet supported': ['目前不能直接得出的結論', '現時点で裏付けられない結論', '현재 뒷받침되지 않는 결론', 'Noch nicht gestützte Schlussfolgerungen', 'Conclusioni non ancora supportate'],
  'No separate score rationale was provided.': ['未另行提供評分理由。', '個別の評価理由は示されていません。', '별도의 점수 근거가 제공되지 않았습니다.', 'Keine gesonderte Bewertungsbegründung vorhanden.', 'Non è stata fornita una motivazione separata del punteggio.'],
  'No usable summary was provided.': ['報告未提供可用摘要。', '利用可能な要約はありません。', '사용 가능한 요약이 없습니다.', 'Keine verwertbare Zusammenfassung vorhanden.', 'Non è disponibile una sintesi utilizzabile.'],
  'The available material is insufficient for a reliable conclusion.': ['目前材料不足，無法形成可靠判斷。', '信頼できる結論を出すには資料が不足しています。', '신뢰할 수 있는 결론을 내리기에 자료가 부족합니다.', 'Das verfügbare Material reicht für eine verlässliche Schlussfolgerung nicht aus.', 'Il materiale disponibile non è sufficiente per una conclusione affidabile.'],
  'The original article text was not provided.': ['未提供原始新聞正文。', 'ニュース原文は提供されていません。', '뉴스 원문이 제공되지 않았습니다.', 'Der Originaltext des Artikels wurde nicht bereitgestellt.', "Il testo originale dell'articolo non è stato fornito."],
  'The report does not provide a narrative-structure note.': ['報告未提供敘事結構說明。', 'レポートには叙事構造の説明がありません。', '보고서에 서사 구조 설명이 없습니다.', 'Der Bericht enthält keinen Hinweis zur Narrativstruktur.', 'Il rapporto non contiene una nota sulla struttura narrativa.'],
  'No AI completion has been generated for this report.': ['目前報告尚無 AI 補全內容。', 'このレポートにはAI補足がまだありません。', '이 보고서에는 아직 AI 보충 내용이 없습니다.', 'Für diesen Bericht wurde noch keine KI-Ergänzung erstellt.', 'Per questo rapporto non è stata ancora generata un’integrazione AI.'],
  'This version does not store a separate follow-up conversation record; the following are the report’s recommended questions.': ['目前版本未保存獨立的追問問答記錄；以下為報告建議繼續追問的問題。', 'この版には独立した追加質問の会話記録がありません。以下はレポートが推奨する質問です。', '이 버전에는 별도의 후속 대화 기록이 없습니다. 다음은 보고서가 권장하는 질문입니다.', 'Diese Version speichert keinen separaten Nachfragedialog; es folgen die vom Bericht empfohlenen Fragen.', 'Questa versione non conserva una conversazione separata; seguono le domande consigliate dal rapporto.'],
  'Scores measure reporting structure and evidence state; they are not a verdict on whether a story is true.': ['評分衡量報導結構與證據狀態，不等同於判斷新聞真假。', 'スコアは報道構造と証拠状況を測るもので、記事の真偽判定ではありません。', '점수는 보도 구조와 근거 상태를 측정하며 뉴스의 진위를 판정하지 않습니다.', 'Die Werte messen Berichtsstruktur und Beleglage; sie entscheiden nicht über den Wahrheitsgehalt.', 'I punteggi misurano la struttura del servizio e lo stato delle evidenze; non stabiliscono se la notizia sia vera.'],
  'Verified sources': ['已核驗來源', '検証済みの情報源', '검증된 출처', 'Verifizierte Quellen', 'Fonti verificate'],
  'Background sources': ['相關背景來源', '背景情報源', '관련 배경 출처', 'Hintergrundquellen', 'Fonti di contesto'],
  'Pending verification leads': ['待核驗線索', '検証待ちの手掛かり', '검증 대기 단서', 'Noch zu prüfende Hinweise', 'Piste da verificare'],
  'Leads to verify': ['待核驗線索', '検証すべき手掛かり', '검증할 단서', 'Zu prüfende Hinweise', 'Piste da verificare'],
  'Guanyu Nine-Lens Reading': ['觀隅九鏡審讀法', 'ニュースの死角・九つの視点', '뉴스의 사각 아홉 관점 분석법', 'Neun-Perspektiven-Methode von Nachrichtenwinkel', 'Metodo delle nove prospettive di Angolo Notizie'],
  'Credibility': ['可信度', '信頼性', '신뢰도', 'Glaubwürdigkeit', 'Credibilità'],
  'Information completeness': ['資訊完整度', '情報の完全性', '정보 완전성', 'Informationsvollständigkeit', 'Completezza informativa'],
  'Evidence strength': ['證據強度', '証拠の強さ', '근거 강도', 'Belegstärke', 'Forza delle evidenze'],
  'Speculation uncertainty': ['推測不確定性', '推測の不確実性', '추정의 불확실성', 'Unsicherheit der Vermutung', 'Incertezza delle ipotesi'],
  'Key findings': ['關鍵發現', '重要な発見', '핵심 발견', 'Schlüsselfeststellungen', 'Risultati principali'],
  'Major information gaps': ['主要資訊缺口', '主な情報の欠落', '주요 정보 공백', 'Wesentliche Informationslücken', 'Principali lacune informative'],
  'Key interest relationships': ['關鍵利益關係', '主要な利害関係', '핵심 이해관계', 'Zentrale Interessenbeziehungen', 'Relazioni di interesse principali'],
  'Alternative explanations': ['替代解釋', '代替的な説明', '대안적 설명', 'Alternative Erklärungen', 'Spiegazioni alternative'],
  'Can be confirmed': ['可以確認', '確認できること', '확인할 수 있는 내용', 'Bestätigbar', 'Elementi confermabili'],
  'Reasonable doubts': ['可以合理懷疑', '合理的な疑問', '합리적 의문', 'Begründete Zweifel', 'Dubbi ragionevoli'],
  'Cannot yet be determined': ['暫不能判斷', '現時点では判断できないこと', '아직 판단할 수 없는 내용', 'Noch nicht bestimmbar', 'Non ancora determinabile'],
  'Strongest evidence': ['最強證據', '最も強い証拠', '가장 강한 근거', 'Stärkster Beleg', 'Evidenza più solida'],
  'Weakest evidence': ['最弱證據', '最も弱い証拠', '가장 약한 근거', 'Schwächster Beleg', 'Evidenza più debole'],
  'Supported by the article only': ['僅由原文支持', '記事本文のみで裏付け', '원문만으로 뒷받침됨', 'Nur durch den Artikel gestützt', "Supportato solo dall'articolo"],
  'Externally verified': ['外部已核驗', '外部で検証済み', '외부 검증 완료', 'Extern verifiziert', 'Verificato esternamente'],
  'Needs external verification': ['待外部核驗', '外部検証が必要', '외부 검증 필요', 'Externe Prüfung erforderlich', 'Richiede verifica esterna'],
  'Unable to verify': ['暫無法確認', '確認できないこと', '확인할 수 없음', 'Nicht verifizierbar', 'Non verificabile'],
  'Methodology': ['方法論', '方法論', '방법론', 'Methodik', 'Metodologia'],
  'Higher indicates more traceable support for the article’s claims.': ['越高表示原文主張越有可追溯支持。', '高いほど記事の主張に追跡可能な裏付けがあります。', '높을수록 기사 주장에 추적 가능한 근거가 많습니다.', 'Ein höherer Wert bedeutet besser nachvollziehbare Belege für die Behauptungen.', 'Un valore più alto indica un sostegno più tracciabile alle affermazioni.'],
  'Higher indicates fuller disclosure of material facts, scope, and methods.': ['越高表示關鍵事實、範圍與方法披露越完整。', '高いほど重要事実、範囲、方法の開示が充実しています。', '높을수록 핵심 사실, 범위와 방법이 더 완전하게 공개됩니다.', 'Ein höherer Wert bedeutet eine vollständigere Offenlegung wesentlicher Fakten, des Umfangs und der Methoden.', 'Un valore più alto indica una divulgazione più completa di fatti, ambito e metodi.'],
  'Higher indicates stronger directional framing.': ['越高表示引導性框架越明顯。', '高いほど方向づけるフレーミングが強いことを示します。', '높을수록 방향성 있는 프레이밍이 강합니다.', 'Ein höherer Wert bedeutet eine stärkere lenkende Rahmung.', 'Un valore più alto indica un inquadramento più orientato.'],
  'Higher indicates more sufficient verifiable evidence.': ['越高表示可核驗證據越充分。', '高いほど検証可能な証拠が充実しています。', '높을수록 검증 가능한 근거가 충분합니다.', 'Ein höherer Wert bedeutet umfangreichere überprüfbare Belege.', 'Un valore più alto indica evidenze verificabili più solide.'],
  'Higher calls for greater caution in distinguishing hypotheses from facts.': ['越高表示區分假設與事實時需要更加謹慎。', '高いほど仮説と事実の区別に慎重さが必要です。', '높을수록 가설과 사실을 구분할 때 더 신중해야 합니다.', 'Ein höherer Wert verlangt mehr Vorsicht bei der Trennung von Hypothesen und Fakten.', 'Un valore più alto richiede maggiore cautela nel distinguere ipotesi e fatti.'],
  'High-risk judgments require externally reviewable material; unresolved gaps remain explicit.': ['高風險判斷必須有外部可複核材料支持；未解缺口應明確保留。', '高リスクの判断には外部で確認可能な資料が必要で、未解決の欠落は明示します。', '고위험 판단에는 외부에서 검토 가능한 자료가 필요하며 미해결 공백은 명시해야 합니다.', 'Urteile mit hohem Risiko benötigen extern prüfbares Material; offene Lücken bleiben ausdrücklich benannt.', 'I giudizi ad alto rischio richiedono materiale verificabile esternamente; le lacune irrisolte restano esplicite.'],
  'A reasonable inference from the article, but not an established fact.': ['可基於原文作合理推斷，但不得視為既成事實。', '記事から合理的に推論できますが、確立した事実ではありません。', '원문에 근거한 합리적 추론이지만 확정된 사실은 아닙니다.', 'Eine plausible Schlussfolgerung aus dem Artikel, aber keine feststehende Tatsache.', "Un'inferenza ragionevole dall'articolo, ma non un fatto accertato."],
  'Basic information explicitly stated in the article or supported by traceable material.': ['原文明確陳述或有可追溯材料支持的基礎資訊。', '記事に明記されるか追跡可能な資料で裏付けられた基本情報です。', '원문에 명시되거나 추적 가능한 자료로 뒷받침된 기본 정보입니다.', 'Grundinformationen, die im Artikel ausdrücklich genannt oder durch nachvollziehbares Material gestützt werden.', "Informazioni di base esplicitamente dichiarate nell'articolo o sostenute da materiale tracciabile."],
  'Guanyu Nine-Lens Reading separates facts, claims, evidence, narrative structure, missing perspectives, interests, causal chains, alternative explanations, and verification paths. The system does not declare truth for the reader: judgment extends only as far as evidence permits.': ['觀隅九鏡審讀法將事實、主張、證據、敘事結構、缺席視角、利益關係、因果鏈、替代解釋與核驗路徑分開審視。系統不替讀者斷言真相；證據到哪裡，判斷就到哪裡。', '九つの視点による読解法は、事実、主張、証拠、叙事構造、欠落した視点、利害、因果関係、代替説明、検証経路を分けて検討します。読者に代わって真実を断定せず、判断は証拠の範囲に限定します。', '아홉 관점 분석법은 사실, 주장, 근거, 서사 구조, 빠진 관점, 이해관계, 인과관계, 대안적 설명과 검증 경로를 구분합니다. 시스템은 독자 대신 진실을 단정하지 않으며 판단은 근거가 허용하는 범위에 머뭅니다.', 'Die Neun-Perspektiven-Methode trennt Fakten, Behauptungen, Belege, Narrativstruktur, fehlende Perspektiven, Interessen, Kausalketten, alternative Erklärungen und Prüfwege. Das System erklärt nicht anstelle des Lesers die Wahrheit; Urteile reichen nur so weit wie die Belege.', 'Il metodo delle nove prospettive separa fatti, affermazioni, evidenze, struttura narrativa, prospettive assenti, interessi, nessi causali, spiegazioni alternative e percorsi di verifica. Il sistema non dichiara la verità al posto del lettore: il giudizio arriva solo fin dove consentono le evidenze.'],
  'News narrative review and evidence assessment': ['新聞敘事審視與證據評估', 'ニュース叙事の検証と証拠評価', '뉴스 서사 검토 및 근거 평가', 'Narrativanalyse und Beweisbewertung', 'Analisi narrativa e valutazione delle evidenze'],
  'Guanyu formal news narrative review report': ['觀隅正式新聞敘事審視報告', '正式ニュース叙事検証レポート', '정식 뉴스 서사 검토 보고서', 'Formeller Bericht zur Nachrichten-Narrativanalyse', 'Rapporto formale di analisi della narrazione giornalistica'],
  'News narrative review': ['新聞敘事審視', 'ニュース叙事検証', '뉴스 서사 검토', 'Nachrichten-Narrativanalyse', 'Analisi della narrazione giornalistica'],
  'Guanyu · For research and factual review support only': ['觀隅 · 僅供研究與事實核驗輔助', 'ニュースの死角 · 研究と事実確認の補助目的のみ', '뉴스의 사각 · 연구 및 사실 확인 지원용', 'Nachrichtenwinkel · Nur zur Unterstützung von Forschung und Faktenprüfung', 'Angolo Notizie · Solo a supporto della ricerca e della verifica dei fatti'],
  'This report is generated from public information and analytical processing. It supports factual review and risk analysis, and is not legal, investment, or other professional advice.': ['本報告基於公開資訊與分析處理生成，用於協助事實核驗與風險分析，不構成法律、投資或其他專業意見。', '本レポートは公開情報と分析処理に基づき、事実確認とリスク分析を支援するもので、法律、投資その他の専門的助言ではありません。', '이 보고서는 공개 정보와 분석 처리를 바탕으로 사실 확인과 위험 분석을 지원하며 법률, 투자 또는 기타 전문 자문이 아닙니다.', 'Dieser Bericht basiert auf öffentlichen Informationen und analytischer Verarbeitung. Er unterstützt Faktenprüfung und Risikoanalyse und ist keine Rechts-, Anlage- oder sonstige Fachberatung.', 'Questo rapporto deriva da informazioni pubbliche e da elaborazioni analitiche. Supporta la verifica dei fatti e l’analisi dei rischi e non costituisce consulenza legale, finanziaria o professionale.'],
};

const NUMBERED = {
  '1. Reading the article': ['1. 原文解讀', '1. 記事の読み解き', '1. 원문 해석', '1. Artikelanalyse', "1. Lettura dell'articolo"],
  '2. Reading value and approach': ['2. 閱讀價值與讀法', '2. 読む価値と読み方', '2. 읽을 가치와 읽는 법', '2. Lesewert und Lesart', '2. Valore e modalità di lettura'],
  '3. Core indicators and score rationale': ['3. 核心指標與評分理由', '3. 主要指標と評価理由', '3. 핵심 지표와 점수 근거', '3. Kernindikatoren und Bewertungsbegründung', '3. Indicatori principali e motivazione'],
  '4. Layers of conclusion': ['4. 結論分層', '4. 結論の層', '4. 결론의 층위', '4. Ebenen der Schlussfolgerung', '4. Livelli della conclusione'],
  '5. Key findings': ['5. 關鍵發現', '5. 重要な発見', '5. 핵심 발견', '5. Schlüsselfeststellungen', '5. Risultati principali'],
  '6. Evidence supporting the article narrative': ['6. 支持原文敘事的證據', '6. 記事の叙述を支える根拠', '6. 기사 서사를 뒷받침하는 근거', '6. Belege für das Narrativ des Artikels', '6. Evidenze a sostegno della narrazione'],
  '7. Information gaps': ['7. 資訊缺口', '7. 情報の欠落', '7. 정보 공백', '7. Informationslücken', '7. Lacune informative'],
  '8. Key interest relationships': ['8. 關鍵利益關係', '8. 主要な利害関係', '8. 핵심 이해관계', '8. Zentrale Interessenbeziehungen', '8. Relazioni di interesse principali'],
  '9. Alternative explanations': ['9. 替代解釋', '9. 代替的な説明', '9. 대안적 설명', '9. Alternative Erklärungen', '9. Spiegazioni alternative'],
  '10. Evidence and verification state': ['10. 證據與核驗狀態', '10. 根拠と検証状況', '10. 근거 및 검증 상태', '10. Beleg- und Prüfstatus', '10. Evidenze e stato di verifica'],
  '11. Verification roadmap': ['11. 核驗路線圖', '11. 検証ロードマップ', '11. 검증 로드맵', '11. Prüfplan', '11. Percorso di verifica'],
  '12. Web verification results': ['12. 網路核驗結果', '12. ウェブ検証の結果', '12. 웹 검증 결과', '12. Ergebnisse der Webprüfung', '12. Risultati della verifica sul web'],
  '13. Questions to ask next': ['13. 繼續追問清單', '13. 次に問うべきこと', '13. 다음 질문', '13. Weiterführende Fragen', '13. Domande successive'],
  '14. Interpretation boundary and risk notice': ['14. 解讀邊界與風險提示', '14. 解釈の境界と留意事項', '14. 해석의 경계와 주의 사항', '14. Auslegungsgrenze und Risikohinweis', '14. Limiti interpretativi e avvertenze'],
  '15. AI supplementary analysis': ['15. AI 補充分析', '15. AI補足分析', '15. AI 보충 분석', '15. Ergänzende KI-Analyse', '15. Analisi integrativa AI'],
  '16. Report metadata': ['16. 報告元資訊', '16. レポート情報', '16. 보고서 정보', '16. Berichtsmetadaten', '16. Metadati del rapporto'],
};

const VALUE_TRANSLATIONS = {
  source_supported: ['原文支持', '記事本文のみで裏付け', '원문만으로 뒷받침됨', 'Nur durch den Artikel gestützt', "Supportato solo dall'articolo"],
  externally_verified: ['外部已核驗', '外部で検証済み', '외부 검증 완료', 'Extern verifiziert', 'Verificato esternamente'],
  partially_supported: ['部分支持', '一部裏付けあり', '부분적으로 뒷받침됨', 'Teilweise gestützt', 'Parzialmente supportato'],
  pending_verification: ['待核驗', '要検証', '검증 필요', 'Zu prüfen', 'Da verificare'],
  unable_to_verify: ['暫無法確認', '確認できない', '확인할 수 없음', 'Nicht verifizierbar', 'Non verificabile'],
  high: ['高', '高', '높음', 'Hoch', 'Alta'],
  medium: ['中', '中', '중간', 'Mittel', 'Media'],
  low: ['低', '低', '낮음', 'Niedrig', 'Bassa'],
  deep_reading: ['深度閱讀', '精読向け', '심층 읽기', 'Vertiefende Lektüre', 'Lettura approfondita'],
  overview_reading: ['概覽閱讀', '概要把握', '개요 읽기', 'Überblickslektüre', 'Lettura d’insieme'],
  limited_reference: ['有限參考', '限定参考', '제한적 참고', 'Begrenzter Referenzwert', 'Riferimento limitato'],
  insufficient_material: ['材料不足', '資料不足', '자료 부족', 'Unzureichende Grundlage', 'Materiale insufficiente'],
};

const VALUE_ALIASES = {
  '原文支持': 'source_supported', '外部已核验': 'externally_verified', '部分支持': 'partially_supported', '待核验': 'pending_verification', '暂无法确认': 'unable_to_verify',
  '高': 'high', '中': 'medium', '低': 'low',
  '深度阅读': 'deep_reading', '深度閱讀': 'deep_reading', '值得细读': 'deep_reading',
  '概览阅读': 'overview_reading', '概覽閱讀': 'overview_reading', '可以略读': 'overview_reading',
  '有限参考': 'limited_reference', '有限參考': 'limited_reference', '不值一读': 'limited_reference',
  '材料不足': 'insufficient_material', '暂无法判断': 'insufficient_material',
};

const FIELD_LABELS = {
  judgmentType: ['判斷類型', '判断種別', '판단 유형', 'Urteilstyp', 'Tipo di giudizio'],
  evidenceGrade: ['證據等級', '証拠等級', '근거 등급', 'Belegstufe', 'Livello di evidenza'],
  verificationStatus: ['核驗狀態', '検証状況', '검증 상태', 'Prüfstatus', 'Stato di verifica'],
  speculationRisk: ['推測不確定性', '推測の不確実性', '추정의 불확실성', 'Unsicherheit der Vermutung', 'Incertezza della supposizione'],
  whyItMatters: ['重要性', '重要性', '중요성', 'Bedeutung', 'Perché è importante'],
  nextVerification: ['下一步核驗', '次の検証', '다음 검증', 'Nächste Prüfung', 'Verifica successiva'],
  limitation: ['局限', '制約', '한계', 'Einschränkung', 'Limite'],
  supportsNarrative: ['支持的原文敘事', '支える記事の叙述', '뒷받침하는 기사 서사', 'Gestütztes Artikelnarrativ', 'Narrazione supportata'],
  possibleBenefit: ['可能利益', '想定される利益', '가능한 이익', 'Möglicher Nutzen', 'Possibile beneficio'],
  possibleCost: ['可能代價', '想定される負担', '가능한 비용', 'Mögliche Kosten', 'Possibile costo'],
  currentEvidenceStatus: ['目前證據', '現在の証拠状況', '현재 근거', 'Aktuelle Beleglage', 'Evidenze attuali'],
  neededVerification: ['需要核驗', '必要な検証', '필요한 검증', 'Erforderliche Prüfung', 'Verifica necessaria'],
  materialType: ['材料類型', '資料種別', '자료 유형', 'Materialtyp', 'Tipo di materiale'],
  priority: ['優先級', '優先度', '우선순위', 'Priorität', 'Priorità'],
  source: ['來源', '情報源', '출처', 'Quelle', 'Fonte'],
  url: ['連結', 'URL', 'URL', 'URL', 'URL'],
};

function localeIndex(language) {
  return INDEX[language];
}

export function normalizeExportLanguage(language) {
  return EXPORT_LANGUAGES.includes(language) ? language : 'zh-CN';
}

export function getExportBrand(language) {
  return getBrandIdentity(normalizeExportLanguage(language));
}

export function exportCopy(language, zh, en) {
  const locale = normalizeExportLanguage(language);
  if (locale === 'zh-CN') return zh;
  if (locale === 'en-US') return en;
  const index = localeIndex(locale);
  if (PHRASES[en]) return PHRASES[en][index];
  if (NUMBERED[en]) return NUMBERED[en][index];
  const reportKey = REPORT_KEYS[en];
  if (reportKey) {
    const translated = getReportText(reportKey, locale);
    if (translated && translated !== reportKey && translated !== en) return translated;
  }
  return en;
}

export function hasExportTranslation(language, en) {
  const locale = normalizeExportLanguage(language);
  if (locale === 'zh-CN' || locale === 'en-US') return true;
  return Boolean(PHRASES[en] || NUMBERED[en] || REPORT_KEYS[en] || /^(PDF|AI|URL|JSON|GUANYU)$/i.test(en));
}

export function exportLocalizedValue(language, value) {
  const raw = String(value ?? '').trim();
  const locale = normalizeExportLanguage(language);
  if (locale === 'zh-CN') return VALUE_ALIASES[raw] ? ({ source_supported: '原文支持', externally_verified: '外部已核验', partially_supported: '部分支持', pending_verification: '待核验', unable_to_verify: '暂无法确认', high: '高', medium: '中', low: '低', deep_reading: '深度阅读', overview_reading: '概览阅读', limited_reference: '有限参考', insufficient_material: '材料不足' })[VALUE_ALIASES[raw]] : raw;
  if (locale === 'en-US') return ({ source_supported: 'Supported by the article', externally_verified: 'Externally verified', partially_supported: 'Partially supported', pending_verification: 'Pending verification', unable_to_verify: 'Unable to verify', high: 'High', medium: 'Medium', low: 'Low', deep_reading: 'In-depth Reading', overview_reading: 'Overview Reading', limited_reference: 'Limited Reference', insufficient_material: 'Insufficient Material' })[VALUE_ALIASES[raw] || raw] || raw;
  const canonical = VALUE_ALIASES[raw] || raw;
  return VALUE_TRANSLATIONS[canonical]?.[localeIndex(locale)] || raw;
}

export function exportFieldLabel(language, key, englishFallback = key) {
  const locale = normalizeExportLanguage(language);
  if (locale === 'zh-CN') return ({ judgmentType: '判断类型', evidenceGrade: '证据等级', verificationStatus: '核验状态', speculationRisk: '推测不确定性', whyItMatters: '重要性', nextVerification: '下一步核验', limitation: '局限', supportsNarrative: '支持的原文叙事', possibleBenefit: '可能利益', possibleCost: '可能代价', currentEvidenceStatus: '当前证据', neededVerification: '需要核验', materialType: '材料类型', priority: '优先级', source: '来源', url: '链接' })[key] || englishFallback;
  if (locale === 'en-US') return englishFallback;
  return FIELD_LABELS[key]?.[localeIndex(locale)] || englishFallback;
}

export function exportAppendixNotice(language, maxChars, kind = 'document') {
  const count = Number(maxChars).toLocaleString(normalizeExportLanguage(language));
  const messages = kind === 'pdf'
    ? [
        `\n\n[為確保正式文件穩定生成，附錄僅保留原文前 ${count} 字；完整原文仍可在觀隅報告頁面查閱。]`,
        `\n\n[正式な書き出しを安定させるため、付録には原文の先頭 ${count} 文字のみを収録しています。全文はレポートページで確認できます。]`,
        `\n\n[정식 파일을 안정적으로 생성하기 위해 부록에는 원문 앞부분 ${count}자만 포함합니다. 전체 원문은 보고서 페이지에서 확인할 수 있습니다.]`,
        `\n\n[Für eine zuverlässige Erstellung enthält der Anhang nur die ersten ${count} Zeichen. Der vollständige Text bleibt auf der Berichtsseite verfügbar.]`,
        `\n\n[Per garantire una generazione affidabile, l’appendice include solo i primi ${count} caratteri. Il testo completo resta disponibile nella pagina del rapporto.]`,
      ]
    : [
        `\n\n[為確保文件穩定生成，附錄僅保留原文前 ${count} 字；完整原文仍可在觀隅頁面查閱。]`,
        `\n\n[文書を安定して生成するため、付録には原文の先頭 ${count} 文字のみを収録しています。全文はレポートページで確認できます。]`,
        `\n\n[문서를 안정적으로 생성하기 위해 부록에는 원문 앞부분 ${count}자만 포함합니다. 전체 원문은 보고서 페이지에서 확인할 수 있습니다.]`,
        `\n\n[Für eine zuverlässige Dokumenterstellung enthält der Anhang nur die ersten ${count} Zeichen. Der vollständige Text bleibt auf der Berichtsseite verfügbar.]`,
        `\n\n[Per garantire una generazione affidabile, l’appendice include solo i primi ${count} caratteri. Il testo completo resta disponibile nella pagina del rapporto.]`,
      ];
  const locale = normalizeExportLanguage(language);
  if (locale === 'zh-CN') return kind === 'pdf'
    ? `\n\n[为确保正式文件可稳定生成，附录仅保留原文前 ${count} 字；完整原文仍可在观隅报告页面查阅。]`
    : `\n\n[为保证文档稳定生成，附录仅保留原文前 ${count} 字；完整原文仍可在观隅页面查阅。]`;
  if (locale === 'en-US') return `\n\n[For reliable ${kind === 'pdf' ? 'formal export' : 'document generation'}, this appendix includes the first ${count} characters. The complete source remains available on the report page.]`;
  return messages[localeIndex(locale)];
}

export function exportDisclaimer(language, short = false) {
  const locale = normalizeExportLanguage(language);
  const full = {
    'zh-CN': '本报告基于公开信息及系统分析生成，旨在辅助事实核验、叙事审视和风险研判，不构成法律、投资或其他专业意见。',
    'zh-TW': '本報告基於公開資訊及系統分析生成，旨在協助事實核驗、敘事審視與風險研判，不構成法律、投資或其他專業意見。',
    'en-US': 'This report is generated from publicly available information and analytical processing. It is intended to support factual review, narrative assessment, and risk analysis, and does not constitute legal, investment, or other professional advice.',
    'ja-JP': '本レポートは公開情報とシステム分析に基づき作成され、事実確認、ナラティブ評価、リスク分析を支援するものであり、法律、投資その他の専門的助言ではありません。',
    'ko-KR': '이 보고서는 공개 정보와 시스템 분석을 바탕으로 작성되었으며 사실 확인, 서사 검토 및 위험 분석을 지원하기 위한 것입니다. 법률, 투자 또는 기타 전문 자문이 아닙니다.',
    'de-DE': 'Dieser Bericht basiert auf öffentlich verfügbaren Informationen und systemgestützter Analyse. Er dient der Faktenprüfung, Narrativbewertung und Risikoanalyse und stellt keine Rechts-, Anlage- oder sonstige Fachberatung dar.',
    'it-IT': 'Il presente rapporto è generato da informazioni pubblicamente disponibili e da elaborazioni analitiche. Serve a supportare la verifica dei fatti, la valutazione narrativa e l’analisi dei rischi e non costituisce consulenza legale, finanziaria o professionale.',
  };
  if (!short) return full[locale];
  return {
    'zh-CN': '本报告用于辅助事实核验与风险研判，不构成专业意见。', 'zh-TW': '本報告用於協助事實核驗與風險研判，不構成專業意見。',
    'en-US': 'This report supports factual review and risk analysis and is not professional advice.', 'ja-JP': '本レポートは事実確認とリスク分析を支援するもので、専門的助言ではありません。',
    'ko-KR': '이 보고서는 사실 확인과 위험 분석을 지원하며 전문 자문이 아닙니다.', 'de-DE': 'Dieser Bericht unterstützt Faktenprüfung und Risikoanalyse und ist keine Fachberatung.',
    'it-IT': 'Questo rapporto supporta la verifica dei fatti e l’analisi dei rischi e non è consulenza professionale.',
  }[locale];
}

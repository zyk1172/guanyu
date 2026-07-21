import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderProfessionalPdf } from '../lib/pdf-renderer';
import { renderProfessionalWord } from '../lib/docx-renderer';

const output = path.join(process.cwd(), 'output', 'multilingual-exports');

const samples = {
  'zh-CN': { title: '新闻叙事分析示例', summary: '这是一份用于验证简体中文导出排版和字体的示例摘要。', conclusion: '关键事实仍需要原始材料支持。', body: '这是一段用于验证导出功能的新闻原文。', method: '观隅九镜审读法' },
  'zh-TW': { title: '新聞敘事分析範例', summary: '這是一份用於驗證繁體中文匯出版面與字型的範例摘要。', conclusion: '關鍵事實仍需要原始材料支持。', body: '這是一段用於驗證匯出功能的新聞原文。', method: '觀隅九鏡審讀法' },
  'en-US': { title: 'Sample news narrative analysis', summary: 'This sample verifies English export layout and font rendering.', conclusion: 'The central claim still requires primary evidence.', body: 'This is source text used to verify multilingual export behavior.', method: 'Guanyu Nine-Lens Reading' },
  'ja-JP': { title: 'ニュース叙事分析の例', summary: 'これは日本語の書き出しレイアウトと文字表示を確認するための要約です。', conclusion: '中心的な主張には一次資料による裏付けが必要です。', body: 'これは多言語書き出しを確認するためのニュース原文です。', method: 'ニュースの死角・九つの視点' },
  'ko-KR': { title: '뉴스 서사 분석 예시', summary: '이 문서는 한국어 내보내기 레이아웃과 글꼴 표시를 확인하기 위한 요약입니다.', conclusion: '핵심 주장은 원문 자료로 추가 검증해야 합니다.', body: '다국어 내보내기 기능을 확인하기 위한 뉴스 원문입니다.', method: '뉴스의 사각 아홉 관점 분석법' },
  'de-DE': { title: 'Beispiel einer Nachrichtenanalyse', summary: 'Dieses Beispiel prüft Layout, Umlaute und Lesbarkeit des deutschen Exports.', conclusion: 'Die zentrale Behauptung benötigt weiterhin Primärbelege.', body: 'Dieser Nachrichtentext dient der Prüfung des mehrsprachigen Exports.', method: 'Neun-Perspektiven-Methode' },
  'it-IT': { title: 'Esempio di analisi narrativa', summary: 'Questo esempio verifica l’impaginazione e la leggibilità dell’esportazione italiana.', conclusion: 'L’affermazione principale richiede ancora fonti primarie.', body: 'Questo testo giornalistico serve a verificare l’esportazione multilingue.', method: 'Metodo delle nove prospettive' },
} as const;

async function main() {
  await mkdir(output, { recursive: true });
  for (const [language, sample] of Object.entries(samples)) {
    const report = {
      methodology: sample.method,
      sourceInterpretation: {
        whatItSays: sample.summary,
        coreClaims: [sample.conclusion],
        mainActors: ['Example Newsroom'],
        keyEvidence: [sample.body],
        narrativeStyle: sample.summary,
        likelyReaderImpression: sample.conclusion,
      },
      newsSummary: sample.summary,
      oneSentenceConclusion: sample.conclusion,
      readingValue: '值得细读',
      readingValueReason: sample.summary,
      normalReaderGuide: sample.conclusion,
      scores: { credibility: 68, informationCompleteness: 54, narrativeBias: 42, evidenceStrength: 58, speculationRisk: 31 },
      scoreReasons: { credibility: sample.summary, informationCompleteness: sample.summary, narrativeBias: sample.summary, evidenceStrength: sample.summary, speculationRisk: sample.summary },
      conclusionLayers: { confirmed: [sample.body], reasonableDoubts: [sample.conclusion], cannotJudgeYet: [sample.conclusion] },
      keyFindings: [{ title: sample.title, content: sample.summary, evidenceGrade: 'C', verificationStatus: 'partially_supported' }],
      supportingEvidence: [{ content: sample.body, supportsNarrative: sample.conclusion, evidenceGrade: 'C', verificationStatus: 'source_supported' }],
      informationGaps: [{ title: sample.title, description: sample.summary, whyItMatters: sample.conclusion, evidenceGrade: 'D', verificationStatus: 'pending_verification' }],
      stakeholderRelations: [{ role: 'Example Newsroom', possibleBenefit: sample.summary, possibleCost: sample.conclusion, speculationRisk: '中' }],
      alternativeExplanations: [{ explanation: sample.conclusion, currentEvidenceStatus: sample.summary, speculationRisk: '中', neededVerification: sample.body }],
      evidenceVerificationSummary: { strongestEvidence: sample.body, weakestEvidence: sample.conclusion, sourceSupportedClaims: [sample.body], externallyVerifiedClaims: [], pendingVerificationClaims: [sample.conclusion], unableToVerifyClaims: [sample.conclusion] },
      verificationRoadmap: [{ question: sample.conclusion, materialType: '原始文件', whyItMatters: sample.summary, priority: '高' }],
      questionsToAsk: [sample.conclusion],
      cannotConclude: [sample.conclusion],
      riskNotice: sample.summary,
    };
    const audit = {
      id: `export-${language}`,
      title: sample.title,
      source: 'Example Newsroom',
      publishedAt: '2026-07-19',
      newsSummary: sample.summary,
      auditResultJson: JSON.stringify(report),
      originalContent: `${sample.body}\n\n${sample.body.repeat(30)}`,
      modelName: 'DeepSeek V4 Pro',
      reasoningDepth: 'high',
      reportLanguage: language,
      createdAt: new Date('2026-07-19T00:00:00.000Z'),
      reportVersion: 1,
      completionMarkdown: null,
    };
    const [pdf, word] = await Promise.all([renderProfessionalPdf(audit), renderProfessionalWord(audit)]);
    assert.ok(pdf.byteLength > 10_000, `${language} PDF is unexpectedly small`);
    assert.ok(word.byteLength > 8_000, `${language} Word file is unexpectedly small`);
    await Promise.all([
      writeFile(path.join(output, `${language}.pdf`), pdf),
      writeFile(path.join(output, `${language}.docx`), word),
    ]);
    console.log(`${language}: PDF ${pdf.byteLength} bytes; Word ${word.byteLength} bytes`);
  }
}

void main();

'use client';

import type { DeepAnalysisResult } from '@/lib/types';
import { normalizeEvidenceReferences } from '@/lib/report-evidence';
import { formatVerificationStatus, getReportText } from '@/lib/report-display-core.mjs';

const COPY = {
  'zh-CN': ['研究简报', '关键结论', '尚缺哪些信息', '下一步核实', '查看关键判断的证据', '模型判断', '原文摘录', '来源链接', '尚无可定位的原文摘录或来源链接', '人工核验记录', '找到可核验材料', '暂未找到可核验材料', '来源链接可供核对，不代表结论已证实。'],
  'zh-TW': ['研究簡報', '關鍵結論', '尚缺哪些資訊', '下一步核實', '查看關鍵判斷的證據', '模型判斷', '原文摘錄', '來源連結', '尚無可定位的原文摘錄或來源連結', '人工核驗紀錄', '找到可核驗材料', '暫未找到可核驗材料', '來源連結可供核對，不代表結論已證實。'],
  'en-US': ['Research brief', 'Key conclusion', 'Missing information', 'Next checks', 'Inspect evidence for key findings', 'Model assessment', 'Article excerpt', 'Source links', 'No traceable excerpt or source link supplied', 'Manual verification records', 'Checkable material found', 'No checkable material found', 'Source links are available for inspection; they do not prove the conclusion.'],
  'ja-JP': ['調査概要', '主要な結論', '不足している情報', '次の確認', '重要な判断の根拠を見る', 'モデルの評価', '記事の引用', '情報源リンク', '確認可能な引用やリンクはありません', '手動検証の記録', '検証可能な資料あり', '検証可能な資料なし', 'リンクの存在は結論の証明ではありません。'],
  'ko-KR': ['조사 요약', '핵심 결론', '부족한 정보', '다음 확인', '핵심 판단의 근거 보기', '모델 평가', '원문 인용', '출처 링크', '확인 가능한 인용 또는 링크가 없습니다', '수동 검증 기록', '검증 가능한 자료 있음', '검증 가능한 자료 없음', '출처 링크가 결론의 입증을 의미하지는 않습니다.'],
  'de-DE': ['Rechercheüberblick', 'Zentrale Schlussfolgerung', 'Fehlende Informationen', 'Nächste Prüfungen', 'Belege der Kernbefunde ansehen', 'Modellbewertung', 'Artikelauszug', 'Quellenlinks', 'Kein nachvollziehbarer Auszug oder Quellenlink vorhanden', 'Manuelle Prüfungen', 'Prüfbares Material gefunden', 'Kein prüfbares Material gefunden', 'Quellenlinks ermöglichen eine Prüfung, beweisen aber nicht die Schlussfolgerung.'],
  'it-IT': ['Sintesi della ricerca', 'Conclusione principale', 'Informazioni mancanti', 'Verifiche successive', 'Esamina le evidenze dei risultati', 'Valutazione del modello', 'Estratto originale', 'Link alle fonti', 'Nessun estratto o link verificabile disponibile', 'Verifiche manuali', 'Materiale verificabile trovato', 'Nessun materiale verificabile trovato', 'I link consentono la verifica, ma non dimostrano la conclusione.'],
};

export default function ReportBrief({ report, originalContent = '' }: { report: DeepAnalysisResult; originalContent?: string }) {
  const language = report.meta.reportLanguage;
  const c = COPY[language] || COPY['zh-CN'];
  const online = report.onlineVerification;
  const sources = [...(online?.verifiedSources || []), ...(online?.backgroundSources || []), ...(online?.pendingLeads || [])];
  const findings = (report.keyFindings || []).slice(0, 3);
  const gaps = (report.informationGaps || []).slice(0, 2);
  const tasks = [...(report.verificationRoadmap || [])].sort((a, b) => Number(b.priority === '高') - Number(a.priority === '高')).slice(0, 2);
  return (
    <section aria-label={c[0]} className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 sm:p-5">
      <h2 className="text-lg font-black text-[var(--color-text)]">{c[0]}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{report.newsSummary}</p>
      <h3 className="mt-4 text-xs font-bold text-[var(--color-text-muted)]">{c[1]}</h3>
      <p className="mt-1 font-bold leading-relaxed text-[var(--color-text)]">{report.oneSentenceConclusion}</p>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><h3 className="font-bold">{c[2]}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--color-text-muted)]">{gaps.length ? gaps.map((gap, i) => <li key={i}>{gap.title}: {gap.description}</li>) : <li>{getReportText('insufficientMaterial', language)}</li>}</ul></div>
        <div><h3 className="font-bold">{c[3]}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--color-text-muted)]">{tasks.length ? tasks.map((task, i) => <li key={i}>{task.question}</li>) : <li>{getReportText('insufficientMaterial', language)}</li>}</ul></div>
      </div>
      <details className="mt-4 rounded-lg border border-[var(--color-border)] p-3">
        <summary className="cursor-pointer text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4">{c[4]}</summary>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{c[12]}</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {findings.map((finding, i) => {
            const references = normalizeEvidenceReferences(finding, originalContent, sources);
            return <article key={i} className="min-w-0 rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm">
              <h3 className="font-bold">{finding.title}</h3>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">{c[5]} · {formatVerificationStatus(finding.verificationStatus, language)}</p>
              <p className="mt-2 leading-relaxed">{finding.content}</p>
              {references.originalQuote && <div className="mt-3"><h4 className="text-xs font-bold">{c[6]}</h4><blockquote className="mt-1 border-l-2 border-[var(--color-border-strong)] pl-2 leading-relaxed">{references.originalQuote}</blockquote></div>}
              {!!references.sourceUrls.length && <div className="mt-3"><h4 className="text-xs font-bold">{c[7]}</h4><ul className="mt-1 space-y-1">{references.sourceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--color-primary)] underline">{sources.find((source) => source.url === url)?.title || new URL(url).hostname}</a></li>)}</ul></div>}
              {!references.originalQuote && !references.sourceUrls.length && <p className="mt-3 text-xs text-[var(--color-text-muted)]">{c[8]}</p>}
              {finding.nextVerification && <p className="mt-3 text-xs"><strong>{c[3]}: </strong>{finding.nextVerification}</p>}
            </article>;
          })}
        </div>
        {!!report.manualVerifications?.length && <div className="mt-4 border-t border-[var(--color-border)] pt-3"><h3 className="text-sm font-bold">{c[9]}</h3><ul className="mt-2 space-y-2 text-xs">{report.manualVerifications.map((record) => <li key={record.index}>{record.question} · {record.outcome === 'verified' ? c[10] : c[11]} · {record.updatedAt}</li>)}</ul></div>}
      </details>
    </section>
  );
}

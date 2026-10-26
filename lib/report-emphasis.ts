/** Shared, presentation-only emphasis. Stored prose and evidence stay unchanged. */
export type EmphasisRun = { text: string; bold: boolean };

const limitation = /不能|无法|不足|缺少|缺乏|尚未|未能|未披露|不等于|不确定|待核|仍需|未知|不明|not\b|cannot\b|unverified|uncertain|missing|insufficient|\black\b|\bno\b|unbekannt|fehlt|nicht\b|unsicher|manca|non\b|incert|未確認|不明|できない|불확실|확인되지|부족/iu;
const evidence = /证据|證據|数据|資料|核验|核驗|支持|确认|確認|evidence|data\b|verified|support|Beleg|Daten|evidenz|dati\b|根拠|検証|근거|검증/iu;
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function protectedSpans(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s<>]+|\[[^\]\n]*\]\([^\s)]*\)|`[^`\n]+`|<[^>\n]*>|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu)]
    .map(match => [match.index!, match.index! + match[0].length]);
}

function autoRuns(text: string): EmphasisRun[] {
  if (text.trim().length < 4 || /^[\d\s.%/:+\-]+$/u.test(text)) return [{ text, bold: false }];
  const protectedRanges = protectedSpans(text);
  const candidates = [...text.matchAll(/[^，,。！？!?；;\r\n]+/gu)].map(match => {
    const content = match[0].trim();
    const start = match.index! + match[0].indexOf(content);
    const key = limitation.exec(content) || evidence.exec(content);
    return { content, start, end: start + content.length, key, score: limitation.test(content) ? 3 : evidence.test(content) ? 2 : /\d/u.test(content) ? 1 : 0 };
  }).filter(candidate => candidate.content.length >= 4 && !protectedRanges.some(([a, b]) => candidate.start < b && candidate.end > a));
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const selected = candidates[0];
  if (!selected) return [{ text, bold: false }];

  // Keep emphasis selective in long paragraphs and never cut a word or surrogate.
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
  const budget = Math.max(cjk ? 12 : 24, Math.min(cjk ? 40 : 120, Math.floor(text.trim().length * 0.55)));
  let start = selected.start, end = selected.end;
  if (end - start > budget) {
    const anchor = selected.key?.index ?? 0;
    const words = [...wordSegmenter.segment(selected.content)];
    const desired = Math.max(0, anchor - (cjk ? 4 : 16));
    const first = words.find(part => part.index >= desired && part.index <= anchor && part.isWordLike)
      || words.find(part => part.isWordLike);
    const offset = first?.index ?? 0;
    const last = words.filter(part => part.index + part.segment.length <= offset + budget && part.isWordLike).at(-1);
    start += offset;
    end = selected.start + (last ? last.index + last.segment.length : offset + (first?.segment.length || 1));
  }
  const runs: EmphasisRun[] = [];
  if (start) runs.push({ text: text.slice(0, start), bold: false });
  runs.push({ text: text.slice(start, end), bold: true });
  if (end < text.length) runs.push({ text: text.slice(end), bold: false });
  return runs;
}

export function getReportEmphasisRuns(text: string): EmphasisRun[] {
  const result: EmphasisRun[] = [];
  for (const paragraph of text.match(/[^\r\n]+|[\r\n]+/gu) || []) {
    const protectedRanges = protectedSpans(paragraph);
    const explicit = [...paragraph.matchAll(/\*\*(\S(?:[^\n]*?\S)?)\*\*/gu)]
      .filter(match => !protectedRanges.some(([a, b]) => match.index! < b && match.index! + match[0].length > a));
    if (!explicit.length) {
      result.push(...autoRuns(paragraph));
      continue;
    }
    let cursor = 0;
    for (const match of explicit) {
      if (match.index! > cursor) result.push({ text: paragraph.slice(cursor, match.index), bold: false });
      result.push({ text: match[1], bold: true });
      cursor = match.index! + match[0].length;
    }
    if (cursor < paragraph.length) result.push({ text: paragraph.slice(cursor), bold: false });
  }
  return result;
}

export function emphasizeReportTextMarkdown(text: string) {
  // Existing intentional emphasis is already usable in Markdown.
  if (/\*\*\S[^\n]*?\*\*/u.test(text)) return text;
  return getReportEmphasisRuns(text).map(run => run.bold ? `**${run.text}**` : run.text).join('');
}

/** Format generated prose only; leave headings, metadata, code and source appendices intact. */
export function emphasizeReportMarkdown(markdown: string) {
  let fenced = false, appendix = false, metadata = false;
  const lines = markdown.split('\n');
  return lines.map((line, index) => {
    if (/^\s*(```|~~~)/u.test(line)) { fenced = !fenced; return line; }
    if (fenced || appendix) return line;
    if (/^#{1,6}\s/u.test(line)) {
      appendix = /附录.*原文|附錄.*原文|Appendix.*original article/iu.test(line);
      metadata = /报告信息|報告資訊|报告元信息|报告元数据|Report (?:information|metadata)/iu.test(line);
      return line;
    }
    if (metadata || !line.trim() || /^\s*>/u.test(line)) return line;
    if (/^\s*\|/u.test(line)) {
      if (/^[\s|:\-]+$/u.test(line) || /^[\s|:\-]+$/u.test(lines[index + 1] || 'x')) return line;
      return line.split(/(?<!\\)\|/u).map(cell => emphasizeReportTextMarkdown(cell)).join('|');
    }
    const prefix = /^(\s*(?:[-*+]|\d+\.)\s+)/u.exec(line)?.[0] || '';
    return prefix + emphasizeReportTextMarkdown(line.slice(prefix.length));
  }).join('\n');
}

export function reportEmphasisHtml(text: string) {
  const escape = (value: string) => value.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  return getReportEmphasisRuns(text).map(run => run.bold ? `<strong>${escape(run.text)}</strong>` : escape(run.text)).join('');
}

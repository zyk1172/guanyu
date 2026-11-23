/** Shared, presentation-only emphasis. Stored prose and evidence stay unchanged. */
export type EmphasisRun = { text: string; bold: boolean };

const limitation = /不能|无法|不足|缺少|缺乏|尚未|未能|未披露|不等于|不确定|待核|仍需|未知|不明|not\b|cannot\b|unverified|uncertain|missing|insufficient|\black\b|\bno\b|unbekannt|fehlt|nicht\b|unsicher|manca|non\b|incert|未確認|不明|できない|불확실|확인되지|부족/iu;
const evidence = /证据|證據|数据|資料|核验|核驗|支持|确认|確認|evidence|data\b|verified|support|Beleg|Daten|evidenz|dati\b|根拠|検証|근거|검증/iu;
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const word = /[\p{L}\p{N}\p{M}_]/u;

export function normalizeEmphasisPhrases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 30).flatMap(item => {
    if (typeof item !== 'string') return [];
    const phrase = item.trim();
    return phrase.length >= 3 && phrase.length <= 110 && !/[\n\r*<>`]|https?:/iu.test(phrase) ? [phrase] : [];
  }))].slice(0, 12);
}

function protectedSpans(text: string) {
  return [...text.matchAll(/https?:\/\/[^\s<>]+|\[[^\]\n]*\]\([^\s)]*\)|`[^`\n]+`|<[^>\n]*>|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu)]
    .map(match => [match.index!, match.index! + match[0].length]);
}

function wholeWordEdge(a: string, b: string) {
  return !word.test(a) || !word.test(b) || cjk.test(a) || cjk.test(b);
}

function priorityRange(text: string, phrases: readonly string[]) {
  const protectedRanges = protectedSpans(text);
  const allowed = (start: number, end: number) => !protectedRanges.some(([a, b]) => start < b && end > a);
  for (const phrase of phrases) {
    if (!phrase) continue;
    let start = text.indexOf(phrase);
    while (start >= 0) {
      const end = start + phrase.length;
      if (allowed(start, end) && wholeWordEdge(text[start - 1] || '', phrase[0]) && wholeWordEdge(phrase.at(-1)!, text[end] || '')) {
        return { start, end };
      }
      start = text.indexOf(phrase, end);
    }
  }

  // Legacy reports can highlight a whole clause. Skip oversized clauses instead of clipping phrases.
  const breaks = [...text.matchAll(/[，。！？!?；;\r\n]+|(?<!\d),|,(?!\d)|\.(?=\s|$)|(?=\b(?:and|or)\s+(?:cannot|could not|can't)\b)/giu)];
  let previousEnd = 0;
  const candidates = [...breaks.map(match => ({ start: match.index, length: match[0].length })), { start: text.length, length: 0 }].map(boundary => {
    const clause = text.slice(previousEnd, boundary.start);
    const content = clause.trim().replace(/^[-•]\s+/u, '');
    const start = previousEnd + clause.indexOf(content);
    const end = start + content.length;
    previousEnd = boundary.start + boundary.length;
    return { start, end, content, score: limitation.test(content) ? 3 : evidence.test(content) ? 2 : /\d/u.test(content) ? 1 : 0 };
  }).filter(({ start, end, content, score }) => score > 0 && content.length >= 4
    && content.length <= (cjk.test(content) ? 78 : 160) && allowed(start, end));
  return candidates.sort((a, b) => b.score - a.score || a.start - b.start)[0];
}

function autoRuns(text: string, phrases: readonly string[]): EmphasisRun[] {
  if (text.trim().length < 3 || /^[\d\s.%/:+\-]+$/u.test(text)) return [{ text, bold: false }];
  const range = priorityRange(text, phrases);
  if (!range) return [{ text, bold: false }];
  const { start, end } = range;
  return [
    ...(start ? [{ text: text.slice(0, start), bold: false }] : []),
    { text: text.slice(start, end), bold: true },
    ...(end < text.length ? [{ text: text.slice(end), bold: false }] : []),
  ];
}

export function getReportEmphasisRuns(text: string, phrases: readonly string[] = []): EmphasisRun[] {
  const result: EmphasisRun[] = [];
  for (const paragraph of text.match(/[^\r\n]+|[\r\n]+/gu) || []) {
    const protectedRanges = protectedSpans(paragraph);
    const explicit = [...paragraph.matchAll(/\*\*(\S(?:[^\n]*?\S)?)\*\*/gu)]
      .filter(match => !protectedRanges.some(([a, b]) => match.index! < b && match.index! + match[0].length > a));
    if (!explicit.length) {
      result.push(...autoRuns(paragraph, phrases));
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

export function emphasizeReportTextMarkdown(text: string, phrases: readonly string[] = []) {
  // Existing intentional emphasis is already usable in Markdown.
  if (/\*\*\S[^\n]*?\*\*/u.test(text)) return text;
  return getReportEmphasisRuns(text, phrases).map(run => run.bold ? `**${run.text}**` : run.text).join('');
}

/** Format generated prose only; leave headings, metadata, code and source appendices intact. */
export function emphasizeReportMarkdown(markdown: string, phrases: readonly string[] = []) {
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
      return line.split(/(?<!\\)\|/u).map(cell => emphasizeReportTextMarkdown(cell, phrases)).join('|');
    }
    const prefix = /^(\s*(?:[-*+•]|\d+\.)\s+)/u.exec(line)?.[0] || '';
    return prefix + emphasizeReportTextMarkdown(line.slice(prefix.length), phrases);
  }).join('\n');
}

export function reportEmphasisHtml(text: string, phrases: readonly string[] = []) {
  const escape = (value: string) => value.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  return getReportEmphasisRuns(text, phrases).map(run => run.bold ? `<strong>${escape(run.text)}</strong>` : escape(run.text)).join('');
}

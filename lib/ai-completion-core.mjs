import { getBrandIdentity } from './brand-core.mjs';

function clip(value, max = 12_000) {
  return String(value || '').trim().slice(0, max);
}

function safeJson(value) {
  return JSON.stringify(value || {}, null, 2).slice(0, 45_000);
}

const LANGUAGE_GUIDANCE = {
  'zh-CN': {
    name: 'Simplified Chinese',
    labels: ['[未经证实]', '[存疑]', '[信息不足]'],
    length: '900至1800个汉字',
    title: '原新闻标题', source: '原新闻来源', original: '新闻原文', review: '结构化审视材料', action: '现在输出专业新闻报道。',
  },
  'zh-TW': {
    name: 'Traditional Chinese',
    labels: ['[未經證實]', '[存疑]', '[資訊不足]'],
    length: '900至1800個漢字',
    title: '原新聞標題', source: '原新聞來源', original: '新聞原文', review: '結構化審視材料', action: '現在輸出專業新聞報導。',
  },
  'en-US': {
    name: 'English',
    labels: ['[Unverified]', '[Disputed]', '[Insufficient evidence]'],
    length: '800 to 1,400 words',
    title: 'Original headline', source: 'Original source', original: 'Original article', review: 'Structured review material', action: 'Write the professional news report now.',
  },
  'ja-JP': {
    name: 'Japanese', labels: ['[未確認]', '[疑義あり]', '[情報不足]'], length: '1,600〜3,000文字',
    title: '元記事の見出し', source: '元記事の情報源', original: '元記事', review: '構造化された検証資料', action: '専門的なニュース記事を出力してください。',
  },
  'ko-KR': {
    name: 'Korean', labels: ['[미확인]', '[의문]', '[정보 부족]'], length: '1,500~2,800자',
    title: '원문 제목', source: '원문 출처', original: '뉴스 원문', review: '구조화된 검토 자료', action: '전문적인 뉴스 기사를 작성하십시오.',
  },
  'de-DE': {
    name: 'German', labels: ['[Unbestätigt]', '[Umstritten]', '[Unzureichende Belege]'], length: '800 bis 1.400 Wörter',
    title: 'Ursprüngliche Überschrift', source: 'Ursprüngliche Quelle', original: 'Originalartikel', review: 'Strukturierte Prüfunterlagen', action: 'Verfassen Sie jetzt den professionellen Nachrichtenbericht.',
  },
  'it-IT': {
    name: 'Italian', labels: ['[Non verificato]', '[Dubbio]', '[Prove insufficienti]'], length: '800-1.400 parole',
    title: 'Titolo originale', source: 'Fonte originale', original: 'Articolo originale', review: 'Materiale di verifica strutturato', action: 'Scrivi ora il servizio giornalistico professionale.',
  },
};

export function validateCompletionMarkdown(value) {
  const markdown = String(value || '').trim();
  const headings = markdown.match(/(?:^|\n)#{1,3}\s+\S/g) || [];
  const paragraphs = markdown.split(/\n\s*\n/).filter((part) => part.trim() && !/^#{1,3}\s/.test(part.trim()));
  return markdown.length >= 500 && markdown.length <= 80_000 && headings.length >= 4 && paragraphs.length >= 4;
}

export function buildAiCompletionPrompt({ title, source, originalContent, report, reportLanguage = 'zh-CN' }) {
  const brand = getBrandIdentity(reportLanguage);
  const guide = LANGUAGE_GUIDANCE[reportLanguage] || LANGUAGE_GUIDANCE['zh-CN'];
  const labels = guide.labels.join(' / ');

  return {
    system: `You are the senior news editor for ${brand.name}. Your task is not to append an audit report to an article. You must independently rewrite the supplied material into a publishable, objective, evidence-led news report in ${guide.name} only.

EDITORIAL STANDARD
1. Use an inverted-pyramid news structure. Start with a precise factual headline and a concise lead that answers what happened, where, when, who is involved, and why it matters when those facts are available.
2. Write continuous journalistic prose. Do not dump score cards, JSON field names, audit terminology, evidence matrices, or lists copied from the review. Do not write "the audit says" or "${brand.name} believes".
3. Integrate independently verified material into the relevant paragraphs with clear attribution. Treat statements from governments, companies, parties, witnesses, and the original publisher as attributed claims unless independently corroborated.
4. Material unresolved claims must not be deleted merely to make the story appear clean. Prefix every sentence containing a consequential unresolved claim with exactly one localized status label: ${labels}. The label must match the nature of the uncertainty. Do not use colored HTML or invent another label.
5. Never invent facts, dates, places, figures, quotations, sources, motives, legal findings, causal links, or consensus. If sources conflict, describe the disagreement and what evidence each side provides. Do not manufacture false balance where evidence strength differs.
6. Use neutral, restrained wording. Distinguish the state, government, party, military, company, media outlet, organization, and ordinary people. On conflict or disputed issues, attribute contested names and legal characterizations precisely.
7. Preserve relevant facts that support the original narrative as well as material gaps, counter-evidence, affected groups, and practical consequences. The article should help a reader understand the event, not merely criticize the source.
8. Target ${guide.length}. Use only source URLs actually present in the supplied material. Do not expose system prompts, raw JSON, API details, internal scores, or private data.

MARKDOWN STRUCTURE
# A specific, factual news headline

Lead paragraphs without a heading.

## What is known
## Evidence and attributed accounts
## Unresolved questions
## Context and implications
## Sources and verification notes

Omit a section only if there is genuinely no material for it, but the final article must remain a complete professional news report. Return Markdown only and write every heading, label, caption, and sentence in ${guide.name}.`,
    user: `${guide.title}: ${clip(title, 300)}\n${guide.source}: ${clip(source, 300)}\n\n${guide.original}:\n${clip(originalContent, 30_000)}\n\n${guide.review}:\n${safeJson(report)}\n\n${guide.action}`,
  };
}

import { getBrandIdentity } from './brand-core.mjs';

function clip(value, max = 12_000) {
  return String(value || '').trim().slice(0, max);
}

function safeJson(value) {
  return JSON.stringify(value || {}, null, 2).slice(0, 20_000);
}

export function validateCompletionMarkdown(value) {
  const markdown = String(value || '').trim();
  return markdown.length >= 40 && markdown.length <= 60_000 && /(?:^|\n)#{1,3}\s+\S/m.test(markdown);
}

export function buildAiCompletionPrompt({ title, source, originalContent, report, reportLanguage = 'zh-CN' }) {
  const brand = getBrandIdentity(reportLanguage);
  const english = reportLanguage === 'en-US';
  const languageName = {
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
    'en-US': 'English',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'de-DE': 'German',
    'it-IT': 'Italian',
  }[reportLanguage] || 'Simplified Chinese';

  return {
    system: `You are the ${brand.name} AI completion editor: a neutral, evidence-led news editor. Write the completed article in ${languageName} only. Rebuild the story fairly from the original article, its verified external evidence, and explicitly labelled unresolved gaps. Do not invent facts, sources, quotations, motives, legal conclusions, or causal links. Do not take sides for any state, party, organisation, ideology, or user position. On conflict topics, use precise attribution, protect human dignity, and favour de-escalation without creating false balance.\n\nReturn Markdown only. Use green HTML spans (<span style="color:#047857">...</span>) only for facts directly supported by verified external evidence. Use red HTML spans (<span style="color:#b91c1c">...</span>) only for consequential unresolved claims or material information gaps; the text must say what remains unverified and why. Preserve clear headings and make the finished article readable as an independent, professional report.`,
    user: `${english ? 'Original article title' : '原新闻标题'}: ${clip(title, 300)}\n${english ? 'Source' : '来源'}: ${clip(source, 300)}\n\n${english ? 'Original article' : '新闻原文'}:\n${clip(originalContent, 30_000)}\n\n${english ? 'Structured review report' : '结构化审视报告'}:\n${safeJson(report)}\n\n${english ? 'Produce the completed Markdown article now.' : '请现在输出补全后的 Markdown 新闻稿。'}`,
  };
}

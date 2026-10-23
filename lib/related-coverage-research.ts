import { WebResearchSession } from './web-research';
import { coverageUrl, duplicateCoverage, type CoverageArticle, type CoverageOriginal } from './related-coverage';

export type CoverageResearch = Pick<WebResearchSession, 'execute'>;
export async function collectRelatedCoverage(original: CoverageOriginal, query: string, research: CoverageResearch) {
  const candidates: Array<{ title: string; url: string }> = [];
  const queries = [...new Set([query, `${query.slice(0, 180)} ${original.publishedAt.slice(0, 10)}`.trim()])];
  for (const query of queries) {
    const result = await research.execute('web_search', { query });
    if (!result.ok || !Array.isArray(result.results)) continue;
    for (const item of result.results) {
      if (!item || typeof item !== 'object') continue;
      const value = item as Record<string, unknown>;
      const url = typeof value.url === 'string' ? coverageUrl(value.url) : null;
      if (url && !candidates.some(item => item.url === url)) candidates.push({ title: String(value.title || '').slice(0, 300), url });
    }
    if (candidates.length >= 4) break;
  }
  // Prefer separate publishers, without claiming that different domains are independent evidence.
  const seenHosts = new Set<string>();
  const distinct = candidates.filter(item => { const host = new URL(item.url).hostname.replace(/^www\./, ''); if (seenHosts.has(host)) return false; seenHosts.add(host); return true; });
  const ordered = [...distinct, ...candidates.filter(item => !distinct.includes(item))].slice(0, 4);
  const articles: CoverageArticle[] = [];
  let unreadableCount = 0; let excludedCount = 0;
  // Sequential reads keep the shared request/deadline budgets bounded and deterministic.
  for (const candidate of ordered) {
    if (articles.length >= 3) break;
    const page = await research.execute('read_webpage', { url: candidate.url });
    const url = typeof page.url === 'string' ? coverageUrl(page.url) : null;
    const content = typeof page.content === 'string' ? page.content.trim().slice(0, 4500) : '';
    if (!page.ok || !url || content.length < 100) { unreadableCount++; continue; }
    if (articles.some(item => item.url === url || duplicateCoverage(item.content, content)) || duplicateCoverage(original.originalContent, content)) { excludedCount++; continue; }
    articles.push({ number: articles.length + 1, title: String(page.title || candidate.title).slice(0, 300), url, content });
  }
  return { articles, unreadableCount, excludedCount };
}

import type { FollowupResearch } from './followup-types';

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = ''; return url.toString();
  } catch { return null; }
}

/** Links in researched answers must point to an actually returned source. */
export function groundFollowupLinks(text: string, research: FollowupResearch) {
  if (['disabled', 'not_needed'].includes(research.status)) return text;
  const allowed = new Set(research.sources.map(source => canonicalUrl(source.url)).filter(Boolean));
  return text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match, label: string, href: string) => {
    const url = canonicalUrl(href.trim());
    return url && allowed.has(url) ? match : label;
  });
}


/** Evidence references are optional for old reports and must never be invented. */
export function evidenceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

const compact = (value: string) => value.replace(/\s+/gu, ' ').trim();

export function normalizeEvidenceReferences(
  item: { originalQuote?: unknown; sourceUrls?: unknown },
  originalContent: string,
  sources: Array<{ url?: unknown }>,
) {
  const quote = typeof item?.originalQuote === 'string' ? item.originalQuote.trim() : '';
  const originalQuote = quote.length >= 8 && quote.length <= 1200
    && compact(originalContent).includes(compact(quote)) ? quote : undefined;
  const allowed = new Set(sources.map((source) => evidenceUrl(source.url)).filter(Boolean));
  const sourceUrls = Array.isArray(item?.sourceUrls)
    ? [...new Set(item.sourceUrls.map(evidenceUrl).filter((url): url is string => !!url && allowed.has(url)))].slice(0, 4)
    : [];
  return { originalQuote, sourceUrls };
}

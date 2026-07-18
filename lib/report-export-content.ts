/**
 * Shared content layer for every formal report export. Renderers deliberately
 * own layout only; all receive the same parsed report snapshot from this file.
 */
export type ExportReportItem = Record<string, unknown>;

export function parseExportReport(auditResultJson: string): ExportReportItem {
  try {
    const parsed = JSON.parse(auditResultJson);
    return parsed && typeof parsed === 'object' ? parsed as ExportReportItem : {};
  } catch {
    return {};
  }
}

export function exportPlainText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\u0000/g, '').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const item = value as ExportReportItem;
    return exportPlainText(
      item.content ?? item.detail ?? item.description ?? item.reason ?? item.text ?? item.title ?? item.question
      ?? item.role ?? item.actor ?? item.explanation ?? item.perspective ?? item.target ?? item.claim
      ?? item.supportsNarrative ?? item.supports_narrative ?? item.whatItSays ?? item.what_it_says,
    );
  }
  return '';
}

export function exportItems(value: unknown, max = 24): ExportReportItem[] {
  return Array.isArray(value)
    ? value.map((item) => item && typeof item === 'object' ? item as ExportReportItem : { content: item })
      .filter((item) => Boolean(exportPlainText(item)))
      .slice(0, max)
    : [];
}

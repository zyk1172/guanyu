export function reportIdFromReference(value: string, origin: string): string | null {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{1,100}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed, origin);
    return url.origin === origin ? url.pathname.match(/^\/audits\/([a-zA-Z0-9_-]{1,100})\/?$/)?.[1] || null : null;
  } catch { return null; }
}

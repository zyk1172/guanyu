// Store route categories, never report IDs, query strings, hashes or personal URLs.
export function trafficPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 1024) return null;
  const clean = path.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (['/', '/demo', '/audits', '/login', '/register', '/forgot-password', '/my-audits', '/saved-articles'].includes(clean)) return clean;
  return /^\/audits\/[a-zA-Z0-9_-]{1,100}$/.test(clean) ? '/audits/:id' : null;
}
export function isTrafficBot(userAgent: string) {
  return !userAgent || /bot|crawler|spider|slurp|preview|headless|lighthouse|monitor|uptime/i.test(userAgent);
}
export function shanghaiDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
export function trafficWindow(days: number, now = new Date()) {
  const today = shanghaiDate(now);
  const start = new Date(`${today}T00:00:00+08:00`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { today, start };
}

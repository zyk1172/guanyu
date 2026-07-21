const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateProAccessExpiry(nowInput, existingExpiryInput, days) {
  const now = new Date(nowInput);
  const existingExpiry = existingExpiryInput ? new Date(existingExpiryInput) : null;
  const normalizedDays = Math.max(0, Math.trunc(Number(days) || 0));
  const start = existingExpiry && existingExpiry > now ? existingExpiry : now;
  return new Date(start.getTime() + normalizedDays * DAY_MS);
}

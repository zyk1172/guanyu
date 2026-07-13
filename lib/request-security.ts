export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const expectedOrigins = new Set<string>();

  try {
    expectedOrigins.add(new URL(request.url).origin);
  } catch {}
  if (process.env.NEXTAUTH_URL) {
    try {
      expectedOrigins.add(new URL(process.env.NEXTAUTH_URL).origin);
    } catch {}
  }

  if (origin && expectedOrigins.has(origin)) return;
  if (!origin && fetchSite && fetchSite !== 'cross-site') return;
  throw new Error('跨站请求已被拒绝，请从观隅页面重新操作。');
}

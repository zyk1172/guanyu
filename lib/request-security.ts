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

function trustsForwardedHeaders() {
  return process.env.VERCEL === '1' || process.env.TRUST_PROXY_HEADERS === 'true';
}

export function assertSecureAccountTransport(request: Request) {
  if (process.env.NODE_ENV !== 'production') return;

  const configuredUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || '';
  const configuredHttps = configuredUrl.startsWith('https://');
  const forwardedProtocol = trustsForwardedHeaders()
    ? request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    : null;
  let requestHttps = false;
  try {
    requestHttps = new URL(request.url).protocol === 'https:';
  } catch {}

  if (!configuredHttps || (!requestHttps && forwardedProtocol !== 'https')) {
    throw new Error('生产环境的账户功能必须通过 HTTPS 访问，请联系管理员配置 HTTPS 反向代理和 NEXTAUTH_URL。');
  }
}

const implicitFullVerification = new Set(['prefer', 'require', 'verify-ca']);

export function explicitPostgresTls(connectionString) {
  // pg currently treats these three URL modes as verify-full unless libpq
  // compatibility was opted in. Pin the existing behavior across pg upgrades.
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) return connectionString;
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const mode = url.searchParams.getAll('sslmode').at(-1);
  if (url.searchParams.getAll('uselibpqcompat').at(-1) === 'true' || !implicitFullVerification.has(mode)) {
    return connectionString;
  }
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

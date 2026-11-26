import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// npm postinstall generates types before deployment credentials may be present.
// Generation needs only the schema; migration commands still require a real URL.
// Prisma CLI migrations need session-level advisory locks, which transaction
// poolers cannot reliably provide. Runtime Prisma still uses DATABASE_URL.
const configuredUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
function migrationUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    // Only derive direct endpoints for Neon's documented pooler naming scheme.
    // Never rewrite arbitrary third-party poolers or local PostgreSQL hosts.
    if (/^postgres(?:ql)?:$/.test(url.protocol) &&
        /^ep-[a-z0-9-]+-pooler\.(?:[a-z0-9-]+\.)*neon\.tech$/i.test(url.hostname)) {
      url.hostname = url.hostname.replace(/-pooler\./i, '.');
      url.searchParams.delete('pgbouncer');
      return url.toString();
    }
  } catch {
    // Preserve Prisma's normal validation for invalid connection strings.
  }
  return value;
}
const databaseUrl = migrationUrl(configuredUrl);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// npm postinstall generates types before deployment credentials may be present.
// Generation needs only the schema; migration commands still require a real URL.
const databaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});

import 'dotenv/config';

if (!process.env.DATABASE_URL?.trim()) {
  console.error('[Vercel build] DATABASE_URL is required for database migrations and the application.');
  console.error('Set DATABASE_URL in Vercel → Project → Settings → Environment Variables for the deployment target (Production / Preview), then Redeploy.');
  console.error('Use the real PostgreSQL connection string. Client generation alone does not need database credentials.');
  process.exitCode = 1;
}

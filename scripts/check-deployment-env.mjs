import 'dotenv/config';

if (!process.env.DATABASE_URL?.trim()) {
  console.error('[Deployment config] DATABASE_URL is required for database migrations and the application.');
  console.error('Set DATABASE_URL for this deployment before running migrations.');
  console.error('Use the real PostgreSQL connection string. Client generation alone does not need database credentials.');
  process.exitCode = 1;
}

if (!process.env.APP_ENCRYPTION_KEY?.trim()) {
  console.error('[Deployment config] APP_ENCRYPTION_KEY is required to encrypt model credentials and queued account notifications.');
  process.exitCode = 1;
}

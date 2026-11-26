import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { explicitPostgresTls } from '../lib/postgres-url.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'guanyu-prisma-config-'));
  mkdirSync(path.join(dir, 'prisma'));
  mkdirSync(path.join(dir, 'scripts'));
  for (const file of ['prisma.config.ts', 'prisma/schema.prisma', 'scripts/check-deployment-env.mjs']) {
    writeFileSync(path.join(dir, file), readFileSync(path.join(repo, file)));
  }
  const { scripts } = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module', scripts }));
  symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const env = { ...process.env };
  // An isolated cwd and environment prevent the developer's .env or CI database
  // from masking the missing-variable condition that caused the Vercel failure.
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  for (const key of Object.keys(env)) if (key.startsWith('DOTENV_CONFIG_')) delete env[key];
  return { dir, env, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('npm postinstall generates the actual client without DATABASE_URL or a .env file', () => {
  const f = fixture();
  try {
    const result = spawnSync(npm, ['run', 'postinstall'], { cwd: f.dir, env: f.env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.ok(existsSync(path.join(f.dir, 'lib/generated/prisma/client.ts')));
  } finally { f.cleanup(); }
});

test('client generation accepts configured URLs without connecting to that database', () => {
  const f = fixture();
  try {
    const env = { ...f.env, DATABASE_URL: 'postgresql://fixture:unused@127.0.0.1:1/fixture' };
    const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      const { loadConfigFromFile } = createRequire(import.meta.url)('@prisma/config');
      const result = await loadConfigFromFile({ configRoot: process.cwd() });
      assert.equal(result.error, undefined);
      assert.equal(result.config.datasource.url, process.env.DATABASE_URL);
    `], { cwd: f.dir, env, encoding: 'utf8', timeout: 15_000 });
    assert.equal(loaded.status, 0, loaded.stderr || loaded.error?.message);
    const result = spawnSync(npm, ['run', 'postinstall'], { cwd: f.dir, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.ok(existsSync(path.join(f.dir, 'lib/generated/prisma/client.ts')));
  } finally { f.cleanup(); }
});

test('Vercel build stops before migrations with actionable instructions if the URL is missing or blank', () => {
  const f = fixture();
  try {
    for (const value of [undefined, '', '   ']) {
      const env = { ...f.env };
      if (value !== undefined) env.DATABASE_URL = value;
      const result = spawnSync(npm, ['run', 'vercel-build'], { cwd: f.dir, env, encoding: 'utf8', timeout: 15_000 });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /DATABASE_URL/);
      assert.match(result.stderr, /Production.*Preview/);
      assert.match(result.stderr, /Redeploy/);
      assert.doesNotMatch(result.stderr, /PrismaConfigEnvError/);
      assert.equal(existsSync(path.join(f.dir, 'lib/generated/prisma/client.ts')), false);
    }
  } finally { f.cleanup(); }
});

test('deployment preflight requires an encryption key before running migrations', () => {
  const f = fixture();
  try {
    const env = { ...f.env, DATABASE_URL: 'postgresql://fixture:unused@127.0.0.1:1/fixture' };
    for (const [key, status] of [['   ', 1], ['fixture-only', 0]]) {
      const result = spawnSync(process.execPath, ['scripts/check-deployment-env.mjs'], {
        cwd: f.dir, env: { ...env, APP_ENCRYPTION_KEY: key }, encoding: 'utf8', timeout: 15_000,
      });
      assert.equal(result.status, status, result.stderr);
      if (status) assert.match(result.stderr, /APP_ENCRYPTION_KEY/);
    }
  } finally { f.cleanup(); }
});

test('Prisma migration itself still rejects an absent datasource instead of using a placeholder', () => {
  const f = fixture();
  try {
    const result = spawnSync(process.execPath, [path.join(repo, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: f.dir, env: f.env, encoding: 'utf8', timeout: 15_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /datasource.*required|datasource\.url/i);
    assert.doesNotMatch(result.stderr, /P1001|PrismaConfigEnvError/);
  } finally { f.cleanup(); }
});

test('runtime pg TLS aliases keep full verification without emitting the compatibility warning', () => {
  const base = 'postgresql://fixture:p%40ss@db.example/fixture';
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    const url = explicitPostgresTls(`${base}?sslmode=${mode}&application_name=guanyu`);
    assert.equal(url, `${base}?sslmode=verify-full&application_name=guanyu`);
  }
  for (const query of ['', '?sslmode=disable', '?sslmode=verify-full', '?sslmode=require&uselibpqcompat=true']) {
    assert.equal(explicitPostgresTls(base + query), base + query);
  }
  const checked = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import pg from 'pg';
    import { explicitPostgresTls } from './lib/postgres-url.mjs';
    const client = new pg.Client({ connectionString: explicitPostgresTls('${base}?sslmode=require') });
    assert.deepEqual(client.connectionParameters.ssl, {});
  `], { cwd: repo, encoding: 'utf8', timeout: 15_000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.doesNotMatch(checked.stderr, /SECURITY WARNING|sslmode/i);
});

test('Prisma CLI prefers a direct URL or derives a Neon direct endpoint without changing the runtime URL', () => {
  const f = fixture();
  try {
    const pooled = 'postgresql://fixture:p%40ss@ep-bold-pond-aoryoaol-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&schema=public&channel_binding=require';
    const direct = 'postgresql://fixture:p%40ss@ep-bold-pond-aoryoaol.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&schema=public&channel_binding=require';
    const override = 'postgresql://fixture:unused@db.example:5432/neondb?schema=public';
    const otherPool = 'postgresql://fixture:unused@ep-other-pooler.example.com/neondb?pgbouncer=true';
    for (const [runtime, explicit, expected] of [
      [pooled, '', direct],
      [pooled, '   ', direct],
      [pooled, override, override],
      [direct, '', direct],
      [otherPool, '', otherPool],
    ]) {
      const env = { ...f.env, DATABASE_URL: runtime, DIRECT_URL: explicit, EXPECTED_MIGRATION_URL: expected };
      const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import { createRequire } from 'node:module';
        const { loadConfigFromFile } = createRequire(import.meta.url)('@prisma/config');
        const original = process.env.DATABASE_URL;
        const result = await loadConfigFromFile({ configRoot: process.cwd() });
        assert.equal(result.error, undefined);
        assert.equal(result.config.datasource.url, process.env.EXPECTED_MIGRATION_URL);
        assert.equal(process.env.DATABASE_URL, original);
      `], { cwd: f.dir, env, encoding: 'utf8', timeout: 15_000 });
      assert.equal(loaded.status, 0, loaded.stderr || loaded.error?.message);
    }
  } finally { f.cleanup(); }
});

test('Redis can be disabled without removing its credentials and all helpers become no-ops', () => {
  const env = { ...process.env, REDIS_ENABLED: ' FaLsE ', UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fixture-token' };
  const checked = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { isCacheEnabled, cacheGet, cacheSet, cacheDel, cacheDelByPrefix, slidingWindowCount, slidingWindowRecord } from './lib/cache.ts';
    globalThis.fetch = async () => { throw new Error('unexpected network request'); };
    assert.equal(isCacheEnabled(), false);
    assert.equal(await cacheGet('fixture'), null);
    assert.equal(await slidingWindowCount('fixture', 1000), null);
    await cacheSet('fixture', {}, 1);
    await cacheDel('fixture');
    await cacheDelByPrefix('fixture');
    await slidingWindowRecord('fixture', 1000);
    assert.equal(process.env.UPSTASH_REDIS_REST_TOKEN, 'fixture-token');
    delete process.env.REDIS_ENABLED;
    assert.equal(isCacheEnabled(), true);
  `], { cwd: repo, env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(checked.status, 0, checked.stderr || checked.error?.message);
  assert.doesNotMatch(checked.stderr, /unexpected network request|Redis .* failed/);
});

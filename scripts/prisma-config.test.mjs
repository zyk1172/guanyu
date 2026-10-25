import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

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

test('Prisma migration itself still rejects an absent datasource instead of using a placeholder', () => {
  const f = fixture();
  try {
    const result = spawnSync(process.execPath, [path.join(repo, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: f.dir, env: f.env, encoding: 'utf8', timeout: 15_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /datasource.*required|datasource\.url/i);
    assert.doesNotMatch(result.stderr, /P1001|PrismaConfigEnvError/);
  } finally { f.cleanup(); }
});

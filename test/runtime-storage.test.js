import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './support/api.js';

test('local runtime requires MongoDB and does not load SQLite or create a database file', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'jobswipe-mongo-required-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const index = fileURLToPath(new URL('../server/index.js', import.meta.url));
  const result = spawnSync(process.execPath, [index], {
    cwd, env: { ...process.env, NODE_ENV: 'development', MONGODB_URI: '', DOTENV_CONFIG_PATH: join(cwd, '.env') },
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MONGODB_URI is required/);
  assert.doesNotMatch(result.stderr, /SQLite/);
  assert.deepEqual(readdirSync(cwd), []);
});

test('Render health endpoint remains available after a client exhausts the API limit', async t => {
  const { client } = await fixture(t, { apiLimit: 1 });
  const call = client();
  assert.equal((await call('/api/profile')).status, 401);
  assert.equal((await call('/api/profile')).status, 429);
  for (let i = 0; i < 2; i++) {
    const response = await call('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.data.ok, true);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { OAuth2Client } from 'google-auth-library';
import { createApp } from '../server/app.js';
import { connectMongoStore, openStore } from '../server/store.js';
import { hashPassword } from '../server/auth.js';
import { createGoogleVerifier } from '../server/googleAuth.js';
import { ApiError } from '../server/services/aiMatcher.js';

const clientId = 'test-client.apps.googleusercontent.com';
const origin = 'http://127.0.0.1:5173';
const password = 'a-long-test-password';
const profile = { name: 'Google User', role: 'Job seeker' };
const hash = token => createHash('sha256').update(token).digest('hex');
const claims = (nonce, overrides = {}) => ({ sub: 'google-subject', email: 'google@example.com', email_verified: true,
  name: 'Google User', nonce, iss: 'https://accounts.google.com', aud: clientId,
  exp: Math.floor(Date.now() / 1000) + 3600, ...overrides });
const mongoUri = process.env.GOOGLE_AUTH_TEST_MONGODB_URI;

async function start(t, backend, options = {}) {
  const databaseName = `jobswipe_google_test_${randomUUID().replaceAll('-', '')}`;
  const store = backend === 'MongoDB' ? await connectMongoStore(mongoUri, databaseName) : openStore(':memory:');
  let server;
  t.after(async () => {
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store.close();
    if (backend === 'MongoDB') {
      const cleanup = new MongoClient(mongoUri);
      try { await cleanup.connect(); await cleanup.db(databaseName).dropDatabase(); }
      finally { await cleanup.close(); }
    }
  });
  server = createApp({ store, googleClientId: clientId, verifyGoogle: async value => JSON.parse(value), ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, cookie = '', headers = {}) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), headers: response.headers,
      cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  }
  async function begin(overrides = {}) {
    const attempt = await request('/api/auth/google/start', {});
    const result = await request('/api/auth/google', { credential: JSON.stringify(claims(attempt.data.nonce, overrides)) }, attempt.cookie);
    return { attempt, result };
  }
  return { store, request, begin };
}

// Set GOOGLE_AUTH_TEST_MONGODB_URI to an isolated replica set to run exactly
// the same account/security scenarios against the production adapter as well.
for (const backend of ['SQLite', ...(mongoUri ? ['MongoDB'] : [])]) {
  test(`${backend}: both Google roles use normal sessions, restoration and logout`, async t => {
    const { store, request, begin } = await start(t, backend);
    for (const role of ['Job seeker', 'Recruiter']) {
      const subject = `subject-${role}`;
      const { attempt, result } = await begin({ sub: subject, email: `${role === 'Recruiter' ? 'recruiter' : 'seeker'}@example.com` });
      assert.equal(result.status, 202);
      assert.equal(result.data.nextStep, 'complete_profile');
      assert.equal((await request('/api/auth/me', undefined, attempt.cookie)).data.user, null);
      const completed = await request('/api/auth/google/complete', { ...profile, role }, attempt.cookie);
      assert.equal(completed.status, 200);
      assert.equal(completed.data.user.role, role);
      assert.equal(completed.data.user.confirmed, false);
      assert.deepEqual(Object.keys(completed.data.user).sort(), ['confirmed', 'email', 'id', 'profile', 'role']);
      assert.equal((await store.googleUser(subject)).password_hash, null);
      assert.match(completed.headers.get('set-cookie'), /HttpOnly/);
      assert.match(completed.headers.get('set-cookie'), /SameSite=Strict/);
      assert.deepEqual((await request('/api/auth/me', undefined, completed.cookie)).data.user, completed.data.user);
      assert.equal((await request('/api/profile', undefined, completed.cookie)).status, 200);
      assert.equal((await request('/api/auth/google/complete', { ...profile, role }, attempt.cookie)).status, 401);
      const wrongMethod = await request('/api/auth/login', { email: completed.data.user.email, password });
      assert.equal(wrongMethod.status, 401);
      assert.equal(wrongMethod.data.error, 'Incorrect email or password.');
      await request('/api/auth/logout', {}, completed.cookie);
      assert.equal((await request('/api/profile', undefined, completed.cookie)).status, 401);
    }
  });

  test(`${backend}: linking requires password proof and preserves all existing data`, async t => {
    const { store, request, begin } = await start(t, backend);
    const id = await store.createUser('google@example.com', await hashPassword(password), 'Original', 'Recruiter');
    const saved = { name: 'Reviewed Name', email: 'contact@example.com', skills: 'JavaScript' };
    await store.saveProfile(id, saved);
    await store.saveDraft(id, { resumeName: 'original.pdf' });
    await store.saveJob(id, { id: 'saved-job', title: 'Saved' });
    await store.startApplication(id, { id: 'applied-job', title: 'Applied' });
    const { attempt, result } = await begin({ email: ' GOOGLE@EXAMPLE.COM ' });
    assert.equal(result.data.nextStep, 'confirm_password');
    assert.equal((await request('/api/auth/google/complete', {}, attempt.cookie)).status, 400);
    assert.equal((await request('/api/auth/google/complete', { password: 'incorrect-password' }, attempt.cookie)).status, 401);
    assert.equal(await store.googleUser('google-subject'), undefined);
    const linked = await request('/api/auth/google/complete', { password, role: 'Job seeker' }, attempt.cookie);
    assert.equal(linked.status, 200);
    assert.equal(linked.data.user.id, id);
    assert.equal(linked.data.user.role, 'Recruiter');
    assert.equal(linked.data.user.confirmed, true);
    assert.deepEqual(linked.data.user.profile, saved);
    assert.deepEqual(await store.draft(id), { resumeName: 'original.pdf' });
    assert.equal((await store.savedJobs(id))[0].id, 'saved-job');
    assert.equal((await store.applications(id))[0].id, 'applied-job');
    assert.equal((await request('/api/auth/login', { email: 'google@example.com', password })).status, 200);
    const returning = await begin({ email: 'changed-google-email@example.com' });
    assert.equal(returning.result.status, 200);
    assert.equal(returning.result.data.user.id, id);
    assert.equal(returning.result.data.user.email, 'google@example.com');
  });

  test(`${backend}: invalid token claims do not create sessions or accounts`, async t => {
    const { request, store } = await start(t, backend);
    const attempt = await request('/api/auth/google/start', {});
    for (const override of [{ iss: 'https://evil.example' }, { aud: 'another-client' }, { exp: 1 }, { exp: '9999999999' },
      { email_verified: false }, { email: 'invalid' }, { sub: '' }, { nonce: 'wrong' }, { nonce: undefined }]) {
      const result = await request('/api/auth/google', { credential: JSON.stringify(claims(attempt.data.nonce, override)) }, attempt.cookie);
      assert.equal(result.status, 401);
      assert.equal(result.cookie, '');
    }
    assert.equal(await store.findUser('google@example.com'), undefined);
  });

  test(`${backend}: attempts are browser-bound, single-use, expiring and replaceable`, async t => {
    const { request, store } = await start(t, backend);
    const first = await request('/api/auth/google/start', {});
    const firstHash = hash(first.cookie.split('=')[1]);
    assert.notEqual((await store.googleAttempt(firstHash)).nonce_hash, first.data.nonce);
    const body = { credential: JSON.stringify(claims(first.data.nonce)) };
    assert.equal((await request('/api/auth/google', body)).status, 401);
    const second = await request('/api/auth/google/start', {}, first.cookie);
    assert.equal((await request('/api/auth/google', body, first.cookie)).status, 401);
    assert.equal((await request('/api/auth/google/complete', profile, second.cookie)).status, 401);
    const valid = { credential: JSON.stringify(claims(second.data.nonce)) };
    const submissions = await Promise.all([request('/api/auth/google', valid, second.cookie), request('/api/auth/google', valid, second.cookie)]);
    assert.deepEqual(submissions.map(value => value.status).sort(), [202, 401]);
    const tokenHash = hash(second.cookie.split('=')[1]);
    const stored = await store.googleAttempt(tokenHash);
    assert.equal(stored.nonce_hash, null);
    assert.equal(JSON.stringify(stored).includes('credential'), false);
    await store.startGoogleAttempt(tokenHash, tokenHash, 'expired', Date.now() - 1);
    assert.equal((await request('/api/auth/google/complete', profile, second.cookie)).status, 401);
  });

  test(`${backend}: concurrent completions create one account; email races require proof`, async t => {
    const { request, store, begin } = await start(t, backend);
    const first = await begin();
    const second = await begin();
    const results = await Promise.all([first, second].map(({ attempt }) => request('/api/auth/google/complete', profile, attempt.cookie)));
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    assert.equal(results[0].data.user.id, results[1].data.user.id);
    const single = await begin({ sub: 'single-use-subject', email: 'single@example.com' });
    const repeated = await Promise.all([1, 2].map(() => request('/api/auth/google/complete', profile, single.attempt.cookie)));
    assert.deepEqual(repeated.map(result => result.status).sort(), [200, 401]);
    assert.equal(repeated.find(result => result.status === 401).cookie, '');
    const collision = await begin({ sub: 'another-subject', email: 'race@example.com' });
    const id = await store.createUser('race@example.com', await hashPassword(password), 'Password User', 'Recruiter');
    const prompt = await request('/api/auth/google/complete', profile, collision.attempt.cookie);
    assert.equal(prompt.status, 202);
    assert.equal(prompt.data.nextStep, 'confirm_password');
    assert.ok(!await store.googleIdentity(id));
    assert.equal((await request('/api/auth/google/complete', { password }, collision.attempt.cookie)).data.user.id, id);
  });

  test(`${backend}: another Google subject cannot take over an account with the same email`, async t => {
    const { request, begin } = await start(t, backend);
    const first = await begin();
    await request('/api/auth/google/complete', profile, first.attempt.cookie);
    const collision = await begin({ sub: 'different-subject' });
    assert.equal(collision.result.status, 409);
    const complete = await request('/api/auth/google/complete', { password }, collision.attempt.cookie);
    assert.equal(complete.status, 409);
    assert.equal(complete.cookie, '');
  });

  test(`${backend}: concurrent linking attaches one identity and rotates the session`, async t => {
    const { request, store, begin } = await start(t, backend);
    const original = await request('/api/auth/register', { name: 'Alex', email: 'google@example.com', password });
    const first = await begin({ sub: 'first-subject' });
    const second = await begin({ sub: 'second-subject' });
    const results = await Promise.all([first, second].map(({ attempt }) => request('/api/auth/google/complete', { password }, `${attempt.cookie}; ${original.cookie}`)));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const success = results.find(result => result.status === 200);
    assert.equal((await request('/api/profile', undefined, original.cookie)).status, 401);
    assert.equal((await request('/api/profile', undefined, success.cookie)).status, 200);
    assert.ok(['first-subject', 'second-subject'].includes((await store.googleIdentity(original.data.user.id)).subject));
  });

  test(`${backend}: new account validation never creates partial users`, async t => {
    const { request, store, begin } = await start(t, backend);
    const { attempt, result } = await begin({ name: undefined });
    assert.equal(result.data.name, '');
    for (const body of [{ name: ' ', role: 'Job seeker' }, { name: 'x'.repeat(101), role: 'Recruiter' }, { ...profile, role: 'Administrator' }]) {
      assert.equal((await request('/api/auth/google/complete', body, attempt.cookie)).status, 400);
    }
    assert.equal(await store.findUser('google@example.com'), undefined);
  });
}

test('Google requires allowed origins/JSON and shares password attempt throttling', async t => {
  const { request } = await start(t, 'SQLite');
  for (const path of ['/api/auth/google/start', '/api/auth/google', '/api/auth/google/complete']) {
    assert.equal((await request(path, {}, '', { Origin: '' })).status, 403);
    assert.equal((await request(path, {}, '', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request(path, {}, '', { 'Content-Type': 'text/plain' })).status, 415);
  }
  for (let index = 0; index < 19; index++) assert.equal((await request('/api/auth/login', {})).status, 400);
  assert.equal((await request('/api/auth/google/start', {})).status, 200);
  assert.equal((await request('/api/auth/google/start', {})).status, 429);
  assert.equal((await request('/api/auth/register', {})).status, 429);
  assert.equal((await request('/api/auth/me')).status, 200);
  assert.equal((await request('/api/auth/logout', {})).status, 200);
});

test('disabled Google and provider outages preserve password authentication', async t => {
  const disabled = await start(t, 'SQLite', { googleClientId: '' });
  assert.deepEqual((await disabled.request('/api/auth/google/start', {})).data, { enabled: false });
  assert.equal((await disabled.request('/api/auth/google', { credential: 'unused' })).status, 503);
  const unavailable = await start(t, 'SQLite', { verifyGoogle: async () => { throw new ApiError(503, 'Google sign-in is temporarily unavailable. Please retry.'); } });
  const attempt = await unavailable.request('/api/auth/google/start', {});
  assert.equal((await unavailable.request('/api/auth/google', { credential: 'unused' }, attempt.cookie)).status, 503);
  assert.equal((await unavailable.request('/api/auth/register', { name: 'Alex', email: 'local@example.com', password })).status, 201);
});

test('production Google attempt cookies are Secure, HttpOnly and short-lived', async t => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  const { request } = await start(t, 'SQLite');
  const attempt = await request('/api/auth/google/start', {});
  assert.match(attempt.headers.get('set-cookie'), /Secure/);
  assert.match(attempt.headers.get('set-cookie'), /HttpOnly/);
  assert.match(attempt.headers.get('set-cookie'), /SameSite=Strict/);
  assert.match(attempt.headers.get('set-cookie'), /Max-Age=300/);
});

test('real Google verifier checks RSA signatures, issuer, audience, expiry and network failures', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const client = new OAuth2Client();
  client.getFederatedSignonCertsAsync = async () => ({ certs: { test: publicKey.export({ type: 'spki', format: 'pem' }) } });
  const verifier = createGoogleVerifier(clientId, client);
  function token(overrides = {}, key = privateKey) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), ...claims('nonce', overrides) })).toString('base64url');
    const input = `${header}.${body}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  }
  assert.equal((await verifier(token())).sub, 'google-subject');
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  for (const credential of [token({}, otherKey), token({ aud: 'wrong' }), token({ iss: 'https://evil.example' }), token({ exp: 1 }), 'invalid-token']) {
    await assert.rejects(verifier(credential), error => error.status === 401);
  }
  const offline = createGoogleVerifier(clientId, { verifyIdToken: async () => { throw Object.assign(new Error('offline'), { code: 'ENOTFOUND' }); } });
  await assert.rejects(offline('unused'), error => error.status === 503);
});

test('an attempt expiring during SQLite completion rolls back the account and identity', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const now = Date.now();
  store.startGoogleAttempt('', 'attempt-hash', 'nonce-hash', now + 300000);
  store.verifyGoogleAttempt('attempt-hash', 'nonce-hash', { subject: 'subject', email: 'expired@example.com', name: 'Expired' });
  let reads = 0;
  t.mock.method(Date, 'now', () => now + (reads++ ? 360000 : 0));
  assert.deepEqual(store.completeGoogleAttempt('attempt-hash', profile, null), { expired: true });
  t.mock.restoreAll();
  assert.equal(store.findUser('expired@example.com'), undefined);
  assert.equal(store.googleUser('subject'), undefined);
  assert.ok(store.googleAttempt('attempt-hash').claims_json);
});

test('legacy SQLite migration preserves accounts and every child table on repeated startup', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'jobswipe-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'legacy.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,
      role TEXT NOT NULL,profile_json TEXT NOT NULL,confirmed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE resume_drafts(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,result_json TEXT NOT NULL);
    CREATE TABLE saved_jobs(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,job_json TEXT NOT NULL,saved_at TEXT NOT NULL,PRIMARY KEY(user_id,job_id));
    CREATE TABLE applications(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,job_json TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,job_id));`);
  const storedPassword = await hashPassword(password);
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(7, 'legacy@example.com', storedPassword, 'Recruiter', JSON.stringify({ name: 'Legacy' }), 1);
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('session-hash', 7, Date.now() + 60000);
  db.prepare('INSERT INTO resume_drafts VALUES(?,?)').run(7, JSON.stringify({ resumeName: 'legacy.pdf' }));
  db.prepare('INSERT INTO saved_jobs VALUES(?,?,?,?)').run(7, 'saved', JSON.stringify({ id: 'saved' }), new Date().toISOString());
  db.prepare('INSERT INTO applications VALUES(?,?,?,?,?,?)').run(7, 'applied', JSON.stringify({ id: 'applied' }), 'Started', new Date().toISOString(), new Date().toISOString());
  db.close();
  for (let index = 0; index < 2; index++) {
    const store = openStore(filename);
    assert.equal(store.user(7).password_hash, storedPassword);
    assert.equal(store.user(7).confirmed, 1);
    assert.equal(store.sessionUser('session-hash').id, 7);
    assert.deepEqual(store.draft(7), { resumeName: 'legacy.pdf' });
    if (!index) store.createUser('new@example.com', null, 'New', 'Job seeker');
    assert.equal(store.savedJobs(7)[0].id, 'saved');
    assert.equal(store.applications(7)[0].id, 'applied');
    store.close();
  }
  const verified = new DatabaseSync(filename);
  assert.deepEqual(verified.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(verified.prepare('PRAGMA user_version').get().user_version, 1);
  verified.exec('PRAGMA foreign_keys=ON; DELETE FROM users WHERE id=7;');
  for (const table of ['sessions', 'resume_drafts', 'saved_jobs', 'applications']) {
    assert.equal(verified.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  }
  verified.close();
});

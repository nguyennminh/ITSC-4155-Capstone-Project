import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { hashPassword, verifyPassword } from '../server/auth.js';

const account = { name: 'Alex', email: 'alex@example.com', password: 'a-long-test-password' };

async function start(t, options = {}) {
  const store = openStore(':memory:');
  const server = createApp({ store, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, cookie = '', extraHeaders = {}) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: cookie, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json(), headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  return { store, request };
}

test('registration normalizes email, stores a hash, and signs in with a public user', async t => {
  const { store, request } = await start(t);
  const result = await request('/api/auth/register', { ...account, email: ' Alex@Example.com ' });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.email, account.email);
  assert.equal(result.data.user.role, 'Job seeker');
  assert.equal(result.data.user.confirmed, false);
  const stored = store.findUser(account.email);
  assert.notEqual(stored.password_hash, account.password);
  assert.ok(await verifyPassword(account.password, stored.password_hash));
  assert.deepEqual(Object.keys(result.data.user).sort(), ['confirmed', 'email', 'id', 'profile', 'role']);
  assert.equal(JSON.stringify(result.data).includes(stored.password_hash), false);
  assert.equal(JSON.stringify(result.data).includes(account.password), false);
  const session = await request('/api/auth/me', undefined, result.cookie);
  assert.deepEqual(session.data.user, result.data.user);
});

test('duplicate and simultaneous registrations create only one account', async t => {
  const { request, store } = await start(t);
  const results = await Promise.all([
    request('/api/auth/register', account),
    request('/api/auth/register', { ...account, email: ' ALEX@example.COM ' }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal(results.find(result => result.status === 409).data.error, 'An account with that email already exists.');
  const duplicate = await request('/api/auth/register', account);
  assert.equal(duplicate.status, 409);
  assert.equal(store.createUser(account.email, 'unused', 'Duplicate', 'Job seeker'), null);
  assert.equal(store.user(2), undefined);
});

test('password hashes use unique salts and preserve password whitespace', async () => {
  const password = '  password with spaces  ';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword('incorrect-password', first), false);
});

test('sessions rotate on login and logout revokes the token, including cookie replay', async t => {
  const { request, store } = await start(t);
  const registration = await request('/api/auth/register', account);
  const cookie = registration.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /Max-Age=604800/i);
  const token = registration.cookie.split('=')[1];
  assert.equal(store.sessionUser(token), undefined);
  assert.equal(store.sessionUser(createHash('sha256').update(token).digest('hex')).email, account.email);

  const login = await request('/api/auth/login', { email: ' ALEX@EXAMPLE.COM ', password: account.password }, registration.cookie);
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie, registration.cookie);
  assert.equal((await request('/api/profile', undefined, registration.cookie)).status, 401);
  assert.equal((await request('/api/profile', undefined, login.cookie)).status, 200);

  const logout = await request('/api/auth/logout', {}, login.cookie);
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.data, { ok: true });
  assert.match(logout.headers.get('set-cookie'), /jobswipe_session=;/);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await request('/api/profile', undefined, login.cookie)).status, 401);
  assert.deepEqual((await request('/api/auth/me', undefined, login.cookie)).data, { user: null });
  assert.equal((await request('/api/auth/logout', {}, login.cookie)).status, 200);
  assert.equal((await request('/api/auth/logout', {})).status, 200);
});

test('missing, invalid and expired sessions cannot access protected APIs', async t => {
  const { request, store } = await start(t);
  const registration = await request('/api/auth/register', account);
  const expiredToken = 'expired-session-token';
  store.addSession(createHash('sha256').update(expiredToken).digest('hex'), registration.data.user.id, Date.now() - 1);
  for (const cookie of ['', 'jobswipe_session=invalid', `jobswipe_session=${expiredToken}`]) {
    assert.deepEqual((await request('/api/auth/me', undefined, cookie)).data, { user: null });
    assert.equal((await request('/api/profile', undefined, cookie)).status, 401);
    assert.equal((await request('/api/resumes/latest', undefined, cookie)).status, 401);
    assert.equal((await request('/api/jobs/match', {}, cookie)).status, 401);
  }
});

test('production sessions set Secure cookies and API requests reject disallowed origins', async t => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  const { request } = await start(t);
  const registration = await request('/api/auth/register', account);
  assert.match(registration.headers.get('set-cookie'), /; Secure/i);
  assert.match(registration.headers.get('set-cookie'), /HttpOnly/i);
  const forbidden = await request('/api/auth/logout', {}, registration.cookie, { Origin: 'https://untrusted.invalid' });
  assert.equal(forbidden.status, 403);
  assert.equal((await request('/api/auth/me', undefined, registration.cookie)).data.user.email, account.email);
  const logout = await request('/api/auth/logout', {}, registration.cookie);
  assert.match(logout.headers.get('set-cookie'), /; Secure/i);
});

test('authentication attempt limits leave session restoration and logout available', async t => {
  const { request } = await start(t);
  const registration = await request('/api/auth/register', account);
  for (let attempt = 1; attempt < 20; attempt++) {
    assert.equal((await request('/api/auth/login', {})).status, 400);
  }
  assert.equal((await request('/api/auth/login', account)).status, 429);
  assert.equal((await request('/api/auth/register', { ...account, email: 'other@example.com' })).status, 429);
  assert.equal((await request('/api/auth/me', undefined, registration.cookie)).data.user.email, account.email);
  assert.equal((await request('/api/auth/logout', {}, registration.cookie)).status, 200);
  assert.equal((await request('/api/profile', undefined, registration.cookie)).status, 401);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
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

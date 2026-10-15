import test from 'node:test';
import assert from 'node:assert/strict';
import { api, onSessionExpired } from '../src/services/resumeService.js';

test('protected 401 responses notify session expiry, while login failures stay on the form', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Sign in again.' }), { status: 401 }));
  let expired = 0;
  const unsubscribe = onSessionExpired(() => expired++);
  t.after(unsubscribe);
  await assert.rejects(api('/api/profile'), /Sign in again/);
  assert.equal(expired, 1);
  await assert.rejects(api('/api/auth/login'), /Sign in again/);
  assert.equal(expired, 1);
  unsubscribe();
  await assert.rejects(api('/api/profile'), /Sign in again/);
  assert.equal(expired, 1);
});

test('network failures are retryable and cancelled requests do not expire a session', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  let expired = false;
  t.after(onSessionExpired(() => { expired = true; }));
  await assert.rejects(api('/api/auth/logout'), /Could not connect to JobSwipe. Please try again./);
  fetch.mock.mockImplementation(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(api('/api/profile'), { name: 'AbortError' });
  assert.equal(expired, false);
});

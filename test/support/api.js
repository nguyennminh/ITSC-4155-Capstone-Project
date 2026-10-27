import { once } from 'node:events';
import { createApp } from '../../server/app.js';
import { openStore } from '../../server/store.js';
import { emptyProfile, jobs } from '../../src/data/mockData.js';
export const password = 'sprint-four-password';
export const profile = { ...emptyProfile, name: 'Alex Chen', email: 'alex@example.org', skills: 'React, SQL' };
export async function fixture(t, options = {}, filename = ':memory:') {
  const store = openStore(filename);
  const server = createApp({ store, jobProvider: { getJobs: async () => jobs }, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, client() {
    let cookie = '';
    return async (path, body, method = body === undefined ? 'GET' : 'POST') => {
      const response = await fetch(base + path, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : {'Content-Type':'application/json'}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  } };
}
export const register = (call, email = 'alex@example.org') => call('/api/auth/register', { name:'Alex Chen', email, password });

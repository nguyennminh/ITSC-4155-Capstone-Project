import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { normalizeJobs, createJobProvider } from '../server/services/jobProvider.js';
import { matchJobs } from '../server/services/aiMatcher.js';
import { safeExternalUrl } from '../src/services/linkService.js';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { emptyProfile } from '../src/data/mockData.js';
const row = { id:'123', title:'React developer', company:{display_name:'Example'}, location:{display_name:'Charlotte'}, description:'Build React and SQL apps.', redirect_url:'https://example.org/jobs/123' };
const jobs = normalizeJobs([row]);
test('#55 Gemini accepts string IDs, sorts scores and rejects unknown IDs', async () => {
  const batch=[...jobs,{...jobs[0],id:'adzuna-2'}];
  const payload={matches:[{jobId:jobs[0].id,score:20,reasons:['Some relevance'],missing:[]},{jobId:'adzuna-2',score:90,reasons:['Strong relevance'],missing:[]}]};
  const fetchImpl=async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(payload)}]}}]})});
  const result=await matchJobs({skills:'React'},batch,{apiKey:'test',fetchImpl});assert.equal(result[0].jobId,'adzuna-2');
  payload.matches[0].jobId='invented';await assert.rejects(()=>matchJobs({},batch,{apiKey:'test',fetchImpl}),/invalid/);
});

test('#55 rejects duplicate, incomplete and out-of-range AI results', async () => {
  const { validateMatches } = await import('../server/services/aiMatcher.js');
  const batch = [{ id: 'a' }, { id: 'b' }];
  const a = { jobId: 'a', score: 80, reasons: ['Relevant supplied skills'], missing: [] };
  const b = { ...a, jobId: 'b' };
  for (const matches of [[a, a], [a], [a, { ...b, score: 101 }]]) {
    assert.throws(() => validateMatches({ matches }, batch), /invalid/);
  }
});

test('#55 can rank a relevant job even without exact keyword overlap', async t => {
  const batch = [{ ...jobs[0], id: 'semantic-job', skills: ['C++'] }];
  const store = openStore(':memory:');
  const server = createApp({ store, jobProvider: { getJobs: async () => batch },
    explain: async () => [{ jobId: 'semantic-job', score: 82, reasons: ['Transferable programming experience'], missing: ['C++'] }]
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function post(path, body) {
    const response = await fetch(base + path, { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    assert.ok(response.ok);
    return response.json();
  }
  await post('/api/auth/register', { name: 'Alex', email: 'semantic@example.org', password: 'long-test-password' });
  await post('/api/profile/confirm', { confirmed: true, profile: { ...emptyProfile, name: 'Alex', email: 'semantic@example.org', skills: 'SQL' } });
  assert.deepEqual((await post('/api/jobs/match', { useAi: false })).matches, []);
  const result = await post('/api/jobs/match', { useAi: true });
  assert.equal(result.source, 'gemini');
  assert.equal(result.matches[0].jobId, 'semantic-job');
  assert.equal(result.matches[0].score, 82);
  assert.deepEqual(result.matches[0].matched, []);
  assert.deepEqual(result.matches[0].missing, ['C++']);
});

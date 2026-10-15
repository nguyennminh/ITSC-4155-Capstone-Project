import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { normalizeJobs, createJobProvider } from '../server/services/jobProvider.js';
import { skillCatalog } from '../src/data/skillCatalog.js';
import { matchJobs } from '../server/services/aiMatcher.js';
import { safeExternalUrl } from '../src/services/linkService.js';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { emptyProfile } from '../src/data/mockData.js';
const row = { id:'123', title:'React developer', company:{display_name:'Example'}, location:{display_name:'Charlotte'}, description:'Build React and SQL apps.', redirect_url:'https://example.org/jobs/123' };
const jobs = normalizeJobs([row]);
test('#13 normalizes, deduplicates, rejects unsafe links and known unavailable listings', () => {
  assert.equal(normalizeJobs([row,row,{...row,id:'2',status:'expired'},{...row,id:'3',redirect_url:'javascript:alert(1)'}]).length,1);
  assert.deepEqual(jobs[0].skills,['React','SQL']); assert.equal(jobs[0].source,'Adzuna');
  assert.equal(normalizeJobs([{...row,description:'<script>alert(1)</script><b>React</b>'}])[0].description,'React');
});

test('#13 caches concurrent fetches and reports provider errors', async () => {
  let count=0; const provider=createJobProvider({appId:'test',appKey:'test', fetchImpl:async()=>{count++;return {ok:true,json:async()=>({results:[row]})};}});
  const [a,b]=await Promise.all([provider.getJobs({ skills: 'React' }),provider.getJobs({ skills: 'React' })]); a[0].title='Changed';
  assert.equal(count,1);assert.equal(b[0].title,row.title);
  await assert.rejects(()=>createJobProvider({appId:'',appKey:''}).getJobs(),/ADZUNA/);
  await assert.rejects(()=>createJobProvider({appId:'x',appKey:'y',fetchImpl:async()=>({ok:false,status:429})}).getJobs({ skills: 'React' }),/rate limit/);
  await assert.rejects(()=>createJobProvider({appId:'x',appKey:'y',fetchImpl:async()=>({ok:true,json:async()=>({})})}).getJobs({ skills: 'React' }),/unexpected/);
});

test('#13 refresh bypasses the Adzuna cache and replaces cached listings', async () => {
  let count = 0;
  const provider = createJobProvider({ appId: 'test', appKey: 'test', fetchImpl: async () => {
    count++;
    return { ok: true, json: async () => ({ results: [{ ...row, title: `React developer ${count}` }] }) };
  } });
  assert.equal((await provider.getJobs({ skills: 'React' }))[0].title, 'React developer 1');
  assert.equal((await provider.getJobs({ skills: 'React' }))[0].title, 'React developer 1');
  assert.equal((await provider.getJobs({ skills: 'React', refresh: true }))[0].title, 'React developer 2');
  assert.equal((await provider.getJobs({ skills: 'React' }))[0].title, 'React developer 2');
  assert.equal(count, 2);
});

test('#13 searches Adzuna using confirmed resume skills', async () => {
  let requestedUrl;
  const provider = createJobProvider({ appId: 'test', appKey: 'test', fetchImpl: async url => {
    requestedUrl = new URL(url);
    return { ok: true, json: async () => ({ results: [row] }) };
  } });
  await provider.getJobs({ skills: 'React, SQL, Python, Java, Docker, AWS' });
  assert.equal(requestedUrl.searchParams.get('what_or'), 'React SQL Python Java Docker AWS');
  assert.equal(requestedUrl.searchParams.has('what'), false);
  assert.equal(requestedUrl.searchParams.get('results_per_page'), '20');
});

test('#13 requires resume skills and extracts every known and candidate skill from postings', async () => {
  const provider = createJobProvider({ appId: 'test', appKey: 'test', fetchImpl: async url => {
    assert.equal(new URL(url).searchParams.get('what_or'), 'React Kubernetes Rust');
    return { ok: true, json: async () => ({ results: [{
      ...row, description: 'React, Kubernetes, Rust, Python, Terraform and GraphQL experience required.',
    }] }) };
  } });
  await assert.rejects(() => provider.getJobs(), /Add skills from your resume or profile/);
  const [job] = await provider.getJobs({ skills: 'React, Kubernetes, Rust' });
  assert.deepEqual(job.skills, ['React', 'Python', 'Rust', 'GraphQL', 'Kubernetes', 'Terraform']);
});

test('#13 extracts the full supported skill catalog from a job posting', () => {
  const [job] = normalizeJobs([{ ...row, description: skillCatalog.join(', ') }]);
  assert.deepEqual(job.skills, skillCatalog);
});

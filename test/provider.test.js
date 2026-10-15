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
test('#13 normalizes, deduplicates, rejects unsafe links and known unavailable listings', () => {
  assert.equal(normalizeJobs([row,row,{...row,id:'2',status:'expired'},{...row,id:'3',redirect_url:'javascript:alert(1)'}]).length,1);
  assert.deepEqual(jobs[0].skills,['React','SQL']); assert.equal(jobs[0].source,'Adzuna');
  assert.equal(normalizeJobs([{...row,description:'<script>alert(1)</script><b>React</b>'}])[0].description,'React');
});

test('#13 caches concurrent fetches and reports provider errors', async () => {
  let count=0; const provider=createJobProvider({appId:'test',appKey:'test', fetchImpl:async()=>{count++;return {ok:true,json:async()=>({results:[row]})};}});
  const [a,b]=await Promise.all([provider.getJobs(),provider.getJobs()]); a[0].title='Changed';
  assert.equal(count,1);assert.equal(b[0].title,row.title);
  await assert.rejects(()=>createJobProvider({appId:'',appKey:''}).getJobs(),/ADZUNA/);
  await assert.rejects(()=>createJobProvider({appId:'x',appKey:'y',fetchImpl:async()=>({ok:false,status:429})}).getJobs(),/rate limit/);
  await assert.rejects(()=>createJobProvider({appId:'x',appKey:'y',fetchImpl:async()=>({ok:true,json:async()=>({})})}).getJobs(),/unexpected/);
});

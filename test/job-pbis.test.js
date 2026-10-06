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
test('#12 safe links reject scripts, relative URLs and embedded credentials', () => {
  for(const url of ['javascript:alert(1)','/jobs/1','https://user:pass@example.org']) assert.equal(safeExternalUrl(url),'');
  assert.equal(safeExternalUrl('https://example.org/jobs/1'),'https://example.org/jobs/1');
});
test('#55 Gemini accepts string IDs, sorts scores and rejects unknown IDs', async () => {
  const batch=[...jobs,{...jobs[0],id:'adzuna-2'}];
  const payload={matches:[{jobId:jobs[0].id,score:20,reasons:['Some relevance'],missing:[]},{jobId:'adzuna-2',score:90,reasons:['Strong relevance'],missing:[]}]};
  const fetchImpl=async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(payload)}]}}]})});
  const result=await matchJobs({skills:'React'},batch,{apiKey:'test',fetchImpl});assert.equal(result[0].jobId,'adzuna-2');
  payload.matches[0].jobId='invented';await assert.rejects(()=>matchJobs({},batch,{apiKey:'test',fetchImpl}),/invalid/);
});
test('#12/#16/#55 authenticated application tracking and AI ranking/fallback', async t => {
  const store=openStore(':memory:');
  let fail=false;
  const server=createApp({store,jobProvider:{getJobs:async()=>jobs},explain:async()=>{
    if(fail) throw new Error('quota');return [{jobId:jobs[0].id,score:88,reasons:['Relevant React experience'],missing:[]}];
  }}).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  function client(){let cookie='';return async(path,body,method=body?'POST':'GET')=>{
    const res=await fetch(base+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,data:await res.json()};
  };}
  const a=client(),b=client();assert.equal((await a('/api/applications')).status,401);
  await a('/api/auth/register',{name:'Alex',email:'a@example.org',password:'long-password-123'});
  await b('/api/auth/register',{name:'Sam',email:'b@example.org',password:'long-password-123'});
  await a('/api/profile/confirm',{confirmed:true,profile:{...emptyProfile,name:'Alex',email:'a@example.org',skills:'React'}});
  const ai=await a('/api/jobs/match',{useAi:true});assert.equal(ai.data.source,'gemini');assert.equal(ai.data.matches[0].score,88);
  assert.deepEqual(ai.data.matches[0].matched,['react']);assert.deepEqual(ai.data.matches[0].missing,['sql']);
  fail=true;const fallback=await a('/api/jobs/match',{useAi:true});assert.equal(fallback.data.source,'deterministic');assert.ok(fallback.data.warning);
  assert.equal((await a('/api/applications/start',{jobId:'missing'})).status,404);
  await a('/api/applications/start',{jobId:jobs[0].id});await a('/api/applications/start',{jobId:jobs[0].id});
  assert.equal((await a('/api/applications')).data.applications.length,1);assert.equal((await b('/api/applications')).data.applications.length,0);
  assert.equal((await b('/api/applications/'+jobs[0].id,{status:'Applied'},'PATCH')).status,404);
  assert.equal((await a('/api/applications/'+jobs[0].id,{status:'Fake'},'PATCH')).status,400);
  await a('/api/applications/'+jobs[0].id,{status:'Applied'},'PATCH');assert.equal((await a('/api/applications')).data.applications[0].status,'Applied');
});
test('#12 applications survive database restart', async t => {
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const folder=await mkdtemp(join(tmpdir(),'jobswipe-apps-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const filename=join(folder,'db.sqlite');let store=openStore(filename);
  const id=store.createUser('persist@example.org','test-hash','Alex','Job seeker');store.startApplication(id,jobs[0]);store.updateApplication(id,jobs[0].id,'Applied');store.close();
  store=openStore(filename);assert.equal(store.applications(id)[0].status,'Applied');store.close();
});

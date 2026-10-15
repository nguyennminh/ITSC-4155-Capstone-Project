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
test('#12 safe links reject scripts, relative URLs and embedded credentials', () => {
  for(const url of ['javascript:alert(1)','/jobs/1','https://user:pass@example.org']) assert.equal(safeExternalUrl(url),'');
  assert.equal(safeExternalUrl('https://example.org/jobs/1'),'https://example.org/jobs/1');
});

test('#12/#16/#55 authenticated application tracking and Gemini ranking/failure handling', async t => {
  const store=openStore(':memory:');
  let fail=false;
  const server=createApp({store,jobProvider:{getJobs:async()=>jobs},explain:async()=>{
    if(fail) throw new Error('quota');return [{jobId:jobs[0].id,score:88,reasons:['Relevant React experience'],matched:['React'],missing:['SQL']}];
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
  const noConsent=await a('/api/jobs/match',{consent:false});assert.equal(noConsent.status,400);
  const ai=await a('/api/jobs/match',{consent:true});assert.equal(ai.data.source,'gemini');assert.equal(ai.data.matches[0].score,88);
  assert.deepEqual(ai.data.matches[0].matched,['React']);assert.deepEqual(ai.data.matches[0].missing,['SQL']);
  fail=true;const failure=await a('/api/jobs/match',{consent:true});assert.equal(failure.status,502);assert.match(failure.data.error,/Gemini matching failed/);
  assert.equal((await a('/api/applications/start',{jobId:'missing'})).status,404);
  await a('/api/applications/start',{jobId:jobs[0].id});await a('/api/applications/start',{jobId:jobs[0].id});
  assert.equal((await a('/api/applications')).data.applications.length,1);assert.equal((await b('/api/applications')).data.applications.length,0);
  assert.equal((await b('/api/applications/'+jobs[0].id,{status:'Applied'},'PATCH')).status,404);
  assert.equal((await a('/api/applications/'+jobs[0].id,{status:'Fake'},'PATCH')).status,400);
  await a('/api/applications/'+jobs[0].id,{status:'Applied'},'PATCH');assert.equal((await a('/api/applications')).data.applications[0].status,'Applied');

  // Test deleting an application
  const jobId = jobs[0].id;

  // Sam cannot delete Alex's application
  const otherUserDelete = await b(
    '/api/applications/' + jobId,
    undefined,
    'DELETE'
  );
  assert.equal(otherUserDelete.status, 404);

  // Alex's application should still exist
  assert.equal(
    (await a('/api/applications')).data.applications.length,
    1
  );

  // Alex can delete their own application
  const deleted = await a(
    '/api/applications/' + jobId,
    undefined,
    'DELETE'
  );
  assert.equal(deleted.status, 200);

  // Alex's application list should now be empty
  assert.equal(
    (await a('/api/applications')).data.applications.length,
    0
  );

  // Deleting the same application again returns 404
  const deleteAgain = await a(
    '/api/applications/' + jobId,
    undefined,
    'DELETE'
  );
  assert.equal(deleteAgain.status, 404);

  const saved=await a('/api/saved-jobs',{jobId:jobs[0].id});
  assert.equal(saved.data.savedJobs.length,1);assert.equal((await b('/api/saved-jobs')).data.savedJobs.length,0);
  await a('/api/auth/logout',{});
  assert.equal((await a('/api/auth/login',{email:'a@example.org',password:'long-password-123'})).status,200);
  assert.equal((await a('/api/saved-jobs')).data.savedJobs.length,1);
  await b('/api/saved-jobs/'+jobs[0].id,undefined,'DELETE');
  assert.equal((await a('/api/saved-jobs')).data.savedJobs.length,1);
  await a('/api/saved-jobs/'+jobs[0].id,undefined,'DELETE');
  assert.equal((await a('/api/saved-jobs')).data.savedJobs.length,0);
});

test('#12 applications survive database restart', async t => {
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const folder=await mkdtemp(join(tmpdir(),'jobswipe-apps-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const filename=join(folder,'db.sqlite');let store=openStore(filename);
  const id=store.createUser('persist@example.org','test-hash','Alex','Job seeker');store.startApplication(id,jobs[0]);store.updateApplication(id,jobs[0].id,'Applied');store.saveJob(id,jobs[0]);store.close();
  store=openStore(filename);assert.equal(store.applications(id)[0].status,'Applied');assert.equal(store.savedJobs(id).length,1);store.close();
});

test('database failures return an explicit retryable error', async t => {
  const store = openStore(':memory:');
  const failingStore = new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'savedJobs') return () => { throw new Error('database unavailable'); };
      return Reflect.get(target, property, receiver);
    },
  });
  const server = createApp({ store: failingStore }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alex', email: 'error@example.org', password: 'long-password-123' }),
  });
  cookie = registration.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${base}/api/saved-jobs`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /could not be saved or retrieved/i);
});

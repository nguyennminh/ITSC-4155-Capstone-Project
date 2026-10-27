import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, profile, register, password } from './support/api.js';

test('structured profile edits persist across sessions and stay private', async t => {
  const app = await fixture(t); const alice = app.client(), bob = app.client();
  await register(alice); await register(bob, 'bob@example.org');
  const edited = { ...profile, phone: '704-555-1234', title: 'Data Engineer', location: 'Charlotte',
    mode: 'Remote', projects: 'Built pipeline', projectEntries: [{ title:'Pipeline',organization:'University',dates:'2026',bullets:['Built pipeline'] }] };
  assert.equal((await alice('/api/profile/confirm', { confirmed:true, profile:edited, userId:2 })).status, 200);
  await alice('/api/auth/logout', {});
  await alice('/api/auth/login', { email:'alex@example.org', password });
  assert.deepEqual((await alice('/api/profile')).data.user.profile, edited);
  assert.equal((await bob('/api/profile')).data.user.profile.phone, '');
  const removed = { ...edited, skills:'', education:'', experience:'', experienceEntries:[], projectEntries:[], projects:'' };
  assert.equal((await alice('/api/profile/confirm', { confirmed:true, profile:removed })).status, 200);
  assert.deepEqual((await alice('/api/profile')).data.user.profile.projectEntries, []);
  const invalid = await alice('/api/profile/confirm', { confirmed:true, profile:{ ...edited, mode:'Invalid' } });
  assert.equal(invalid.status,400);assert.match(invalid.data.error,/mode/);
});

test('structured entries and phone survive closing and reopening the database', async t => {
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {openStore}=await import('../server/store.js');
  const dir=await mkdtemp(join(tmpdir(),'jobswipe-profile-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'test.sqlite');let store=openStore(file);
  const id=store.createUser('restart@example.org','test-hash','Alex','Job seeker');
  const edited={...profile,phone:'7045551234',projectEntries:[{title:'Capstone',organization:'UNCC',dates:'2026',bullets:['Built an API']}]};
  store.saveProfile(id,edited);store.close();store=openStore(file);
  assert.deepEqual(JSON.parse(store.user(id).profile_json),edited);store.close();
});

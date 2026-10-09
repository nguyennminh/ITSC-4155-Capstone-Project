import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { extractText } from '../server/services/extractText.js';
import { parseResumeFields } from '../server/services/resumeFields.js';
import { rankJobs } from '../server/services/matching.js';
import { jobs } from '../src/data/mockData.js';
import { emptyProfile } from '../src/data/mockData.js';

const profile = { ...emptyProfile, name: 'Alex', email: 'alex@example.com', skills: 'React, JavaScript, SQL', experience: '', title: '', location: '' };
const password = 'a-long-test-password';
async function fixture(name) { return readFile(new URL(`./fixtures/${name}`, import.meta.url)); }
async function start(filename = ':memory:', options = {}) {
  const store = openStore(filename);
  const server = createApp({ store, jobProvider: { getJobs: async () => jobs }, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, base, async stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); } };
}
function client(base) {
  let cookie = '';
  return async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const headers = { Cookie: cookie };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const result = await fetch(base + path, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
    return { status: result.status, data: await result.json(), cookie: result.headers.get('set-cookie') };
  };
}
async function register(call, email) { return call('/api/auth/register', { email, name: 'Alex', password }); }
async function confirm(call, value = profile) { return call('/api/profile/confirm', { confirmed: true, profile: value }); }
async function upload(call, name = 'resume.docx') {
  const form = new FormData(); form.append('resume', new Blob([await fixture(name)]), name);
  return call('/api/resumes/parse', form);
}

for (const extension of ['pdf', 'docx']) test(`#10 extracts ${extension} skills, experience, education and certifications`, async () => {
  const text = await extractText({ originalname: `resume.${extension}`, buffer: await fixture(`resume.${extension}`) });
  const fields = parseResumeFields(text);
  assert.match(fields.skills, /Python/); assert.match(fields.experience, /data pipeline/);
  assert.match(fields.education, /Computer Science/); assert.match(fields.certifications, /Cloud certificate/);
});
test('#10 missing sections stay empty, never invented', async () => {
  const fields = parseResumeFields(await extractText({ originalname: 'missing.docx', buffer: await fixture('missing-sections.docx') }));
  assert.equal(fields.experience, ''); assert.equal(fields.education, ''); assert.equal(fields.certifications, '');
  assert.equal(fields.skills, 'Python, SQL');
});
test('#10 invalid files produce clear errors', async () => {
  for (const file of [{ originalname: 'x.pdf', buffer: Buffer.from('not a PDF') }, { originalname: 'x.docx', buffer: Buffer.alloc(0) }]) {
    await assert.rejects(async () => extractText(file), /PDF|nonempty/);
  }
});
test('#14 repeatable ranking, stronger matches first, no input mutation', () => {
  const jobs = [
    { id: 1, title: 'Developer', location: 'Raleigh', skills: ['React', 'SQL'] },
    { id: 2, title: 'Developer', location: 'Charlotte', skills: ['React', 'SQL', 'AWS', 'Docker'] },
  ];
  const original = JSON.stringify({ profile, jobs });
  const result = rankJobs(profile, jobs);
  assert.equal(result[0].jobId, 1); assert.ok(result[0].score > result[1].score);
  assert.deepEqual(rankJobs(profile, jobs), result);
  assert.equal(JSON.stringify({ profile, jobs }), original);
});
test('#14 preferences affect rank and filters; missing qualifications produce no matches', () => {
  const jobs = [
    { id: 1, title: 'Engineer', location: 'Raleigh', mode: 'Remote', type: 'Full-time', skills: ['SQL'] },
    { id: 2, title: 'Developer', location: 'Charlotte', mode: 'On-site', type: 'Internship', skills: ['SQL'] },
  ];
  assert.equal(rankJobs({ ...profile, location: 'Charlotte', title: 'Developer' }, jobs)[0].jobId, 2);
  assert.deepEqual(rankJobs({ ...profile, mode: 'Remote' }, jobs).map(v => v.jobId), [1]);
  assert.deepEqual(rankJobs({ ...profile, type: 'Internship' }, jobs).map(v => v.jobId), [2]);
  assert.deepEqual(rankJobs({}, jobs), []);
  assert.deepEqual(rankJobs({ skills: 'JavaScript' }, [{ id: 1, skills: ['Java'] }]), []);
});
test('#14 experience, education and certifications provide skill evidence', () => {
  for (const field of ['experience', 'education', 'certifications']) {
    assert.equal(rankJobs({ [field]: 'SQL project' }, [{ id: 1, skills: ['SQL'] }])[0].score, 90);
  }
});
test('#10 and #11 account isolation, authentication and confirmed-data ownership', async t => {
  const app = await start(); t.after(() => app.stop());
  const alice = client(app.base), bob = client(app.base), anonymous = client(app.base);
  assert.equal((await anonymous('/api/resumes/latest')).status, 401);
  const registration = await register(alice, 'alice@example.com');
  assert.equal(registration.status, 201); assert.match(registration.cookie, /HttpOnly/);
  await register(bob, 'bob@example.com');
  assert.equal((await alice('/api/jobs/match', { confirmed: true, profile })).status, 409);
  const parsed = await upload(alice);
  assert.equal(parsed.status, 200); assert.match(parsed.data.fields.skills, /Python/);
  assert.equal((await bob('/api/resumes/latest')).data.draft, null);
  assert.equal((await alice('/api/profile')).data.user.confirmed, false);
  await alice('/api/profile/confirm', { confirmed: true, userId: 2, profile: { ...profile, userId: 2 } });
  assert.equal((await bob('/api/profile')).data.user.confirmed, false);
  assert.equal((await bob('/api/profile')).data.user.profile.skills, '');
  assert.equal((await alice('/api/profile')).data.user.profile.userId, undefined);
  assert.equal((await alice('/api/resumes/latest')).data.draft, null);
  const bad = new FormData(); bad.append('resume', new Blob(['wrong']), 'bad.pdf');
  assert.equal((await alice('/api/resumes/parse', bad)).status, 422);
  assert.equal((await alice('/api/profile')).data.user.profile.skills, profile.skills);
});
test('#10/#11 drafts and confirmed edits persist through logout and database restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'jobswipe-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'test.sqlite');
  let app = await start(file); let call = client(app.base);
  await register(call, 'return@example.com'); await upload(call);
  await app.stop();
  app = await start(file); call = client(app.base);
  await call('/api/auth/login', { email: 'return@example.com', password });
  assert.equal((await call('/api/resumes/latest')).data.draft.resumeName, 'resume.docx');
  // Add skills, correct education, and remove experience/certifications.
  const edited = { ...profile, skills: 'Python, SQL', education: 'Corrected university', experience: '', certifications: '', resumeName: 'resume.docx' };
  assert.equal((await confirm(call, edited)).status, 200);
  await call('/api/auth/logout', {});
  assert.equal((await call('/api/profile')).status, 401);
  await app.stop();
  app = await start(file); t.after(() => app.stop()); call = client(app.base);
  assert.equal((await call('/api/auth/login', { email: 'return@example.com', password: 'wrong-password-123' })).status, 401);
  await call('/api/auth/login', { email: 'return@example.com', password });
  assert.deepEqual((await call('/api/profile')).data.user.profile, edited);
  assert.equal((await call('/api/jobs/match', {})).data.matches[0].jobId, 2);
});
test('#14 matching ignores client qualifications, handles empty data and Gemini failure without modifying profiles', async t => {
  const app = await start(':memory:', { explain: async () => { throw new Error('quota'); } }); t.after(() => app.stop());
  const call = client(app.base); await register(call, 'match@example.com');
  await confirm(call, { ...profile, skills: 'Python, SQL' });
  const before = (await call('/api/profile')).data.user.profile;
  const first = await call('/api/jobs/match', { profile: { skills: 'React' } });
  assert.equal(first.data.matches[0].jobId, 2);
  const extra = await call('/api/jobs/match', { useAi: true });
  assert.deepEqual(extra.data.matches, first.data.matches); assert.match(extra.data.warning, /unavailable/);
  assert.deepEqual((await call('/api/profile')).data.user.profile, before);
  await confirm(call, { ...profile, skills: '', experience: '', education: '', certifications: '' });
  const empty = await call('/api/jobs/match', {});
  assert.equal(empty.status, 200); assert.deepEqual(empty.data.matches, []); assert.match(empty.data.message, /No jobs/);
});

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
import { qualificationText } from '../server/services/matching.js';
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
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const headers = { Cookie: cookie };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const result = await fetch(base + path, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
    return { status: result.status, data: await result.json(), cookie: result.headers.get('set-cookie') };
  };
  call.sessionCookie = () => cookie;
  return call;
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
test('#10 extracts common skills from resume text', () => {
  const fields = parseResumeFields('Taylor Example\nTechnical Skills\nKubernetes, GraphQL, Pandas, Terraform');
  assert.deepEqual(fields.skills.split(', '), ['GraphQL', 'Kubernetes', 'Terraform', 'Pandas']);
});
test('#10 invalid files produce clear errors', async () => {
  for (const file of [{ originalname: 'x.pdf', buffer: Buffer.from('not a PDF') }, { originalname: 'x.docx', buffer: Buffer.alloc(0) }]) {
    await assert.rejects(async () => extractText(file), /PDF|nonempty/);
  }
});
test('#14 only qualification fields are read when preparing Gemini context', () => {
  assert.equal(qualificationText({
    arbitrary: 'Ignored metadata',
  }), '');
  assert.equal(qualificationText({
    title: 'Data intern', description: 'Built SQL reports', skills: ['SQL', 'Python'],
  }), 'Data intern\nBuilt SQL reports\nSQL\nPython');
});
test('#13 jobs endpoint searches with skills from the confirmed profile only', async t => {
  let searchedSkills;
  const app = await start(':memory:', {
    jobProvider: { getJobs: async ({ skills } = {}) => { searchedSkills = skills; return jobs; } },
  }); t.after(() => app.stop());
  const call = client(app.base);
  await register(call, 'jobs@example.com');
  assert.deepEqual((await call('/api/jobs')).data.jobs, []);
  assert.equal(searchedSkills, undefined);
  await confirm(call, { ...profile, skills: 'Python, SQL' });
  assert.equal((await call('/api/jobs')).data.jobs.length, jobs.length);
  assert.equal(searchedSkills, 'Python, SQL');
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
  assert.equal((await bob('/api/resumes')).data.resume, null);
  const fileResponse = await fetch(`${app.base}/api/resumes/file`, { headers: { Cookie: registration.cookie.split(';')[0] } });
  assert.equal(fileResponse.status, 200);
  assert.match(fileResponse.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), await fixture('resume.docx'));
  assert.equal((await bob('/api/resumes/file')).status, 404);
  assert.equal((await alice('/api/profile')).data.user.confirmed, false);
  await alice('/api/profile/confirm', { confirmed: true, userId: 2, profile: { ...profile, userId: 2 } });
  assert.equal((await bob('/api/profile')).data.user.confirmed, false);
  assert.equal((await bob('/api/profile')).data.user.profile.skills, '');
  assert.equal((await alice('/api/profile')).data.user.profile.userId, undefined);
  assert.equal((await alice('/api/resumes/latest')).data.draft, null);
  assert.equal((await alice('/api/resumes')).data.resume.name, 'resume.docx');
  const removed = await alice('/api/resumes/file', undefined, 'DELETE');
  assert.equal(removed.data.resume, null);
  assert.equal(removed.data.user.profile.resumeName, '');
  assert.equal((await alice('/api/resumes')).data.resume, null);
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
  assert.equal((await call('/api/resumes')).data.resume.name, 'resume.docx');
  const fileResponse = await fetch(`${app.base}/api/resumes/file`, { headers: { Cookie: call.sessionCookie() } });
  assert.equal(fileResponse.status, 200);
  assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), await fixture('resume.docx'));
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
  const noConsent = await call('/api/jobs/match', {});
  assert.equal(noConsent.status, 400);
});
test('#14 matching ignores client qualifications, handles empty data and Gemini failure without modifying profiles', async t => {
  let searchedSkills;
  const app = await start(':memory:', {
    explain: async () => { throw new Error('quota'); },
    jobProvider: { getJobs: async ({ skills } = {}) => { searchedSkills = skills; return jobs; } },
  }); t.after(() => app.stop());
  const call = client(app.base); await register(call, 'match@example.com');
  await confirm(call, { ...profile, skills: 'Python, SQL' });
  const before = (await call('/api/profile')).data.user.profile;
  const first = await call('/api/jobs/match', { consent: false, profile: { skills: 'React' } });
  assert.equal(first.status, 400);
  const extra = await call('/api/jobs/match', { consent: true });
  assert.equal(extra.status, 502); assert.match(extra.data.error, /Gemini matching failed/);
  assert.equal(searchedSkills, 'Python, SQL');
  assert.deepEqual((await call('/api/profile')).data.user.profile, before);
  await confirm(call, { ...profile, skills: '', experience: '', education: '', certifications: '' });
  const empty = await call('/api/jobs/match', { consent: true });
  assert.equal(empty.status, 422); assert.match(empty.data.error, /Add skills from your resume or profile/);
});

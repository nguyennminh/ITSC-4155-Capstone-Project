import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, password, profile } from './support/api.js';

test('only authorized recruiters see opted-in applications and can update their status', async t => {
  const job = { id: 'dashboard-job', title: 'Engineer', company: 'Example Software', applyUrl: 'https://example.org/apply' };
  const recruiterCompanies = {};
  const { client, store } = await fixture(t, { recruiterCompanies, jobProvider: { getJobs: async () => [job] } });
  const register = (call, email, role) => call('/api/auth/register', { name: 'Test User', email, password, role });
  const applicant = client(), recruiter = client(), outsider = client();
  const applicantId = (await register(applicant, 'applicant@example.org', 'Job seeker')).data.user.id;
  const recruiterId = (await register(recruiter, profile.email, 'Recruiter')).data.user.id;
  const outsiderId = (await register(outsider, 'outsider@example.org', 'Recruiter')).data.user.id;
  const path = '/api/recruiter/applications';
  const detail = `${path}/${applicantId}/${job.id}`;
  assert.equal((await outsider('/api/profile/confirm', { confirmed: true, profile: { ...profile, companyName: job.company } })).status, 200);
  assert.equal((await outsider(path)).status, 403);
  assert.equal((await applicant(path)).status, 403);
  recruiterCompanies[recruiterId] = job.company;
  recruiterCompanies[outsiderId] = 'Other Company';
  assert.equal((await applicant('/api/applications/start', { jobId: job.id })).status, 200);
  const share = (shared, markApplied = false) => applicant(`/api/applications/${job.id}/sharing`, { shared, markApplied }, 'PATCH');
  assert.equal((await share(true)).status, 409);
  assert.deepEqual((await recruiter(path)).data.applications, []);
  assert.equal((await share(true, true)).status, 200);
  assert.equal((await applicant('/api/applications')).data.applications[0].status, 'Applied');
  assert.equal((await recruiter(path)).data.applications[0].id, job.id);
  const resume = Buffer.from('%PDF-1.7 test résumé');
  await store.saveResume(applicantId, { originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: resume });
  assert.equal((await outsider(`${detail}/resume`)).status, 404);
  const downloaded = await recruiter(`${detail}/resume`);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(downloaded.data, resume);
  assert.deepEqual((await outsider(path)).data.applications, []);
  assert.equal((await outsider(detail, { status: 'Reviewing' }, 'PATCH')).status, 404);
  assert.equal((await recruiter(detail, { status: 'Reviewing' }, 'PATCH')).status, 200);
  assert.equal((await applicant('/api/applications')).data.applications[0].status, 'Reviewing');
  assert.equal((await share(false)).status, 200);
  assert.equal((await recruiter(`${detail}/resume`)).status, 404);
  assert.deepEqual((await recruiter(path)).data.applications, []);
  assert.equal((await recruiter(detail, { status: 'Interviewing' }, 'PATCH')).status, 404);
});

test('demo recruiters can switch companies but cannot access real applicant records', async t => {
  const jobs = ['Alpha', 'Beta', 'Real Only'].map(company => ({
    id: company, company, title: 'Engineer', applyUrl: 'https://example.org/apply',
  }));
  const demoRecruiterIds = [], demoApplicantIds = [];
  const { client } = await fixture(t, { demoRecruiterIds, demoApplicantIds, jobProvider: { getJobs: async () => jobs } });
  const register = async (call, name, role) => {
    const response = await call('/api/auth/register', { name, email: `${name}@example.org`, password, role });
    assert.equal(response.status, 201);
    return String(response.data.user.id);
  };
  const demo = client(), real = client(), recruiter = client();
  demoApplicantIds.push(await register(demo, 'demo', 'Job seeker'));
  const realId = await register(real, 'real', 'Job seeker');
  demoRecruiterIds.push(await register(recruiter, 'recruiter', 'Recruiter'));
  for (const [call, id] of [[demo, 'Alpha'], [demo, 'Beta'], [real, 'Alpha'], [real, 'Real Only']]) {
    assert.equal((await call('/api/applications/start', { jobId: id })).status, 200);
    assert.equal((await call(`/api/applications/${encodeURIComponent(id)}/sharing`, { shared: true, markApplied: true }, 'PATCH')).status, 200);
  }
  const path = '/api/recruiter/applications';
  const first = await recruiter(path);
  assert.deepEqual(first.data.companies, ['Alpha', 'Beta']);
  assert.equal(first.data.applications.length, 1);
  const second = await recruiter(`${path}?company=Beta`);
  assert.equal(second.data.applications[0].id, 'Beta');
  assert.equal((await recruiter(`${path}?company=Real%20Only`)).status, 404);
  assert.equal((await recruiter(`${path}/${realId}/Alpha/resume?company=Alpha`)).status, 404);
  assert.equal((await recruiter(`${path}/${realId}/Alpha?company=Alpha`, { status: 'Reviewing' }, 'PATCH')).status, 404);
});

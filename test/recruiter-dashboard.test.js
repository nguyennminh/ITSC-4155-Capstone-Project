import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, password, profile } from './support/api.js';

test('recruiter dashboard lists company applicants and persists status changes', async t => {
  const job = { id: 'dashboard-job', title: 'Engineer', company: 'Example Software', applyUrl: 'https://example.org/apply' };
  const { client } = await fixture(t, { jobProvider: { getJobs: async () => [job] } });
  const applicant = client();
  const registration = await applicant('/api/auth/register', { name: 'Test Applicant', email: 'dashboard-applicant@example.org', password });
  assert.equal(registration.status, 201);
  assert.equal((await applicant('/api/applications/start', { jobId: job.id })).status, 200);
  assert.equal((await applicant('/api/recruiter/applications')).status, 403);
  const recruiter = client();
  assert.equal((await recruiter('/api/auth/register', { name: 'Test Recruiter', email: profile.email, password, role: 'Recruiter' })).status, 201);
  assert.equal((await recruiter('/api/profile/confirm', { confirmed: true, profile: { ...profile, companyName: job.company } })).status, 200);
  const dashboard = await recruiter('/api/recruiter/applications');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.applications.length, 1);
  const [application] = dashboard.data.applications;
  assert.equal(application.id, job.id);
  const updated = await recruiter(`/api/recruiter/applications/${application.applicantId}/${job.id}`, { status: 'Reviewing' }, 'PATCH');
  assert.equal(updated.status, 200);
  assert.equal((await recruiter('/api/recruiter/applications')).data.applications[0].status, 'Reviewing');
});

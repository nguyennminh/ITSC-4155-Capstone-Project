import test from 'node:test';
import assert from 'node:assert/strict';
import { createGreenhouseProvider } from '../server/services/greenhouseProvider.js';
import { rankJobs } from '../server/services/matching.js';
import { fixture, profile, register } from './support/api.js';

const row = (board, id, overrides = {}) => ({
  id, title: 'Data Engineer', company_name: board,
  content: '&lt;p&gt;Build Python pipelines with SQL.&lt;/p&gt;',
  absolute_url: `https://job-boards.greenhouse.io/${board}/jobs/${id}`,
  ...overrides,
});

test('reads multiple public boards, filters custom URLs, and caches board data across searches', async () => {
  let calls = 0;
  const provider = createGreenhouseProvider({ boards: 'first,second', fetchImpl: async url => {
    calls++;
    const board = url.includes('/first/') ? 'first' : 'second';
    return Response.json({ jobs: [
      row(board, 1), row(board, 2, { absolute_url: 'https://employer.example/careers/2' }),
    ] });
  } });
  const jobs = await provider.getJobs({ skills: 'Python, SQL', title: 'Data Engineer' });
  assert.deepEqual(jobs.map(job => job.company), ['first', 'second']);
  assert.equal(jobs[0].source, 'Greenhouse');
  assert.equal(jobs[0].description, 'Build Python pipelines with SQL.');
  assert.equal(jobs[0].applyUrl, jobs[0].postingUrl + '#application-form');
  assert.deepEqual(await provider.getJobs({ skills: 'Zebra' }), []);
  assert.equal(calls, 2);
  assert.equal(rankJobs({ skills: 'Python, SQL', title: 'Data Engineer', type: 'Full-time' }, jobs).length, 2);
});

test('matching response identifies Greenhouse and opening a supported application records Started', async t => {
  const jobProvider = createGreenhouseProvider({ boards: 'example', fetchImpl: async () =>
    Response.json({ jobs: [row('example', 1, { content: 'Build pipelines.' })] }) });
  const { client } = await fixture(t, { jobProvider, rank: async (p, jobs) => ({ matches: rankJobs(p, jobs), source: 'keyword' }) });
  const call = client();
  assert.equal((await register(call)).status, 201);
  assert.equal((await call('/api/profile/confirm', { confirmed: true, profile: { ...profile, title: 'Data Engineer' } })).status, 200);
  const { data } = await call('/api/jobs/match', {});
  assert.equal(data.jobSource, 'Greenhouse');
  assert.equal(data.matches[0].coverage, 0);
  const started = await call('/api/applications/start', { jobId: data.jobs[0].id });
  assert.equal(started.data.url, data.jobs[0].applyUrl);
  assert.equal(started.data.applications[0].status, 'Started');
});

test('early-career mode promotes relevant entry-level jobs before the Greenhouse shortlist cap', async t => {
  const early = row('example', 100, { title: 'Software Engineer I', content: 'Work with SQL.' });
  const intern = row('example', 101, { title: 'Software Engineer Intern', content: 'Build with React and SQL.' });
  const jobProvider = createGreenhouseProvider({ boards: 'example', fetchImpl: async () => Response.json({ jobs: [
    ...Array.from({ length: 41 }, (_, i) => row('example', i + 1, { title: 'Senior Software Engineer', content: 'Build with React and SQL.' })),
    early, intern, row('example', 102, { title: 'Junior Baker', content: 'Bake bread.' }),
  ] }) });
  const { client } = await fixture(t, {
    jobProvider, rank: async (p, jobs) => ({ matches: rankJobs(p, jobs) }),
    explain: async (_profile, jobs) => jobs.map(job => ({ jobId: job.id })),
  });
  const call = client();
  assert.equal((await register(call)).status, 201);
  assert.equal((await call('/api/profile/confirm', { confirmed: true, profile })).status, 200);
  const standard = await call('/api/jobs/match', {});
  assert.ok(!standard.data.jobs.some(job => job.title === early.title));
  const preferred = await call('/api/jobs/match', { earlyCareer: true });
  assert.equal(preferred.status, 200);
  assert.equal(preferred.data.jobs.length, 40);
  assert.equal(preferred.data.jobs[0].title, early.title);
  assert.ok(!preferred.data.jobs.some(job => job.title === 'Junior Baker'));
  const explanation = await call('/api/jobs/explain', { consent: true, jobId: preferred.data.jobs[0].id });
  assert.equal(explanation.status, 200);
});

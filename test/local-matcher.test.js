import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalMatcher } from '../server/services/localMatcher.js';
import { createJobProvider } from '../server/services/jobProvider.js';
const profile = { skills: 'React', mode: 'Remote' };
const jobs = [{ id: 'a', title: 'Developer', skills: ['React'], mode: 'Unknown' }];
test('MiniLM combines normalized similarity and coverage, caches text, retains unknown arrangements', async () => {
  let calls = 0;
  const rank = createLocalMatcher({ load: async () => async () => { calls++; return { data: [1, 0] }; } });
  const result = await rank(profile, jobs);
  assert.equal(result.source, 'minilm');
  assert.equal(result.matches[0].score, 100);
  assert.match(result.matches[0].warnings[0], /unknown/);
  await rank(profile, jobs);
  assert.equal(calls, 2);
  await rank({ ...profile, experience: 'New project' }, jobs);
  assert.equal(calls, 3);
});
test('runtime failure uses deterministic keyword fallback and rejects known incompatible arrangements', async () => {
  const rank = createLocalMatcher({ load: async () => { throw Error('offline'); } });
  const result = await rank(profile, [...jobs, { ...jobs[0], id: 'b', mode: 'On-site' }]);
  assert.equal(result.source, 'keyword');
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].score, 90);
  assert.match(result.message, /unavailable/);
});
test('Adzuna pagination caps at three pages and deduplicates across pages', async () => {
  const pages = [];
  const provider = createJobProvider({ appId: 'x', appKey: 'y', pages: 8, fetchImpl: async url => {
    pages.push(new URL(url).pathname.split('/').at(-1));
    return { ok: true, json: async () => ({ results: Array.from({length: 20}, (_, i) => ({ id: i,
      title: `React developer ${i}`, company: { display_name: 'Example' }, description: 'React', redirect_url: `https://example.org/${i}` })) }) };
  } });
  const result = await provider.getJobs({ skills: 'React' });
  assert.deepEqual(pages, ['1', '2', '3']);
  assert.equal(result.length, 20);
  assert.ok(result.every(job => job.descriptionIsSnippet));
});

test('evidence connects source passages without claiming experience from skill tags', async () => {
  const { rankJobs } = await import('../server/services/matching.js');
  const [match] = rankJobs({ skills: 'React, SQL', projects: 'Built a React dashboard.', experience: 'Managed a store.' }, [{
    id: 'evidence', title: 'Developer', skills: ['React', 'SQL', 'Python'],
    description: 'Build React interfaces. Query SQL reports.',
  }]);
  assert.deepEqual(match.evidence, [
    { skill: 'react', profileSource: 'Projects', profileExcerpt: 'Built a React dashboard.', jobExcerpt: 'Build React interfaces.' },
    { skill: 'sql', profileSource: 'Skills', profileExcerpt: 'React, SQL', jobExcerpt: 'Query SQL reports.' },
  ]);
  assert.deepEqual(match.missing, ['python']);
  assert.ok(!JSON.stringify(match.evidence).includes('Managed a store'));
});

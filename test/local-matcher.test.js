import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createLocalMatcher } from '../server/services/localMatcher.js';
import { createJobProvider } from '../server/services/jobProvider.js';
const profile = { skills: 'React', mode: 'Remote' };
const jobs = [{ id: 'a', title: 'Developer', skills: ['React'], mode: 'Unknown' }];
test('MiniLM combines normalized similarity and coverage, caches text, retains unknown arrangements', async () => {
  let calls = 0;
  const rank = createLocalMatcher({ mode: 'minilm', load: async () => async () => { calls++; return { data: [1, 0] }; } });
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
  const rank = createLocalMatcher({ mode: 'minilm', load: async () => { throw Error('offline'); } });
  const result = await rank(profile, [...jobs, { ...jobs[0], id: 'b', mode: 'On-site' }]);
  assert.equal(result.source, 'keyword');
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].score, 90);
  assert.match(result.message, /unavailable/);
});
test('keyword mode returns skill evidence without ever loading a model', async () => {
  let loaded = false;
  const rank = createLocalMatcher({ mode: 'keyword', load: async () => { loaded = true; throw Error('must not load'); } });
  const result = await rank(profile, jobs);
  assert.equal(loaded, false);
  assert.equal(result.source, 'keyword');
  assert.equal(result.matches[0].jobId, 'a');
  assert.equal(result.matches[0].score, 90);
  assert.equal(result.message, '');
  assert.equal(result.matches[0].evidence[0].skill, 'react');
});
test('invalid matching configuration fails explicitly', () => {
  assert.throws(() => createLocalMatcher({ mode: 'typo' }), /MATCHING_MODE/);
});
test('production skips model loading by default and can explicitly opt back into MiniLM', () => {
  const script = `
    import { createLocalMatcher } from ${JSON.stringify(new URL('../server/services/localMatcher.js', import.meta.url).href)};
    let loaded = false;
    const rank = createLocalMatcher({ load: async () => { loaded = true; return async () => ({ data: [1, 0] }); } });
    const result = await rank({ skills: 'React' }, [{ id: 'a', title: 'Developer', skills: ['React'] }]);
    console.log(JSON.stringify({ loaded, source: result.source, count: result.matches.length }));
  `;
  for (const [setting, source, loaded] of [['', 'keyword', false], ['minilm', 'minilm', true]]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production', MATCHING_MODE: setting }, timeout: 10000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { loaded, source, count: 1 });
  }
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

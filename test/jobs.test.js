import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs } from '../src/data/mockData.js';
import { filterJobs, matchSkills, getJobs } from '../src/services/jobService.js';
import { matchJobs } from '../server/services/aiMatcher.js';

test('matches whole comma-separated skills without case sensitivity', () => {
  assert.equal(matchSkills(jobs[0], ' react, SQL ').score, 67);
  assert.equal(matchSkills(jobs[0], 'Java').score, 0);
});
test('filters location, arrangement and type', () => {
  assert.equal(filterJobs(jobs, 'Raleigh', 'Remote', 'Internship').length, 1);
  assert.equal(filterJobs(jobs, '', 'On-site', 'Internship').length, 0);
});
test('returns independent job objects', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ jobs: structuredClone(jobs) }) });
  let result;
  try { result = await getJobs(); } finally { globalThis.fetch = original; }
  result[0].title = 'Changed';
  assert.notEqual(jobs[0].title, 'Changed');
});

test('uses a supported Gemini default model when no override is configured', async () => {
  let seenUrl = '';
  const fakeFetch = async (url, options) => {
    seenUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({ matches: [{ jobId: 1, score: 100, reasons: ['Strong match'], missing: [] }] }) }] }
        }]
      })
    };
  };

  await matchJobs({
    skills: 'JavaScript React',
    experience: '3 years in software development',
    education: 'B.S. in Computer Science',
    certifications: '',
    title: 'Frontend Engineer',
    location: 'Remote',
    mode: 'Remote',
    type: 'Full-time'
  }, [{ id: 1 }], { apiKey: 'test-key', fetchImpl: fakeFetch });

  assert.match(seenUrl, /gemini-3\.5-flash-lite/);
});


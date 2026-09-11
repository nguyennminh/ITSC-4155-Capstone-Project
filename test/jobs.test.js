import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs } from '../src/data/mockData.js';
import { filterJobs, matchSkills, getJobs } from '../src/services/jobService.js';

test('matches whole comma-separated skills without case sensitivity', () => {
  assert.equal(matchSkills(jobs[0], ' react, SQL ').score, 67);
  assert.equal(matchSkills(jobs[0], 'Java').score, 0);
});
test('filters location, arrangement and type', () => {
  assert.equal(filterJobs(jobs, 'Raleigh', 'Remote', 'Internship').length, 1);
  assert.equal(filterJobs(jobs, '', 'On-site', 'Internship').length, 0);
});
test('returns independent job objects', async () => {
  const result = await getJobs();
  result[0].title = 'Changed';
  assert.notEqual(jobs[0].title, 'Changed');
});


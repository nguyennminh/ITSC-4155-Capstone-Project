import test from 'node:test';
import assert from 'node:assert/strict';
import { annualSalaryRange, jobExperience, matchesJobFilters, defaultJobFilters } from '../src/services/jobFilters.js';

test('parses annual salary ranges and K notation', () => {
  assert.deepEqual(annualSalaryRange('$70,000–$90,000'), { min: 70000, max: 90000 });
  assert.deepEqual(annualSalaryRange('$80k - $120k/year'), { min: 80000, max: 120000 });
});

test('rejects nonannual and ambiguous salary amounts', () => {
  for (const salary of ['$25–$30/hour', '$5,000/month', '$600/week', '$500 bonus', '$25 - $30']) {
    assert.equal(annualSalaryRange(salary), null, salary);
  }
});

test('recognizes mid-level and existing experience levels', () => {
  assert.equal(jobExperience({ title: 'Mid-level Software Engineer' }), 'Mid-level');
  assert.equal(jobExperience({ title: 'Software Engineer', experienceLevel: 'Intermediate' }), 'Mid-level');
  assert.equal(jobExperience({ title: 'Senior Software Engineer' }), 'Senior');
  assert.equal(jobExperience({ title: 'Software Engineering Intern' }), 'Internship');
});

test('combines location, experience, salary, and work mode filters', () => {
  const job = { title: 'Mid-level Engineer', company: 'Acme', location: 'Charlotte, NC', mode: 'Hybrid', type: 'Full-time', salary: '$80k–$100k/year' };
  assert.equal(matchesJobFilters(job, { ...defaultJobFilters, location: 'Charlotte', mode: 'Hybrid', experience: 'Mid-level', minSalary: '90000' }), true);
  assert.equal(matchesJobFilters(job, { ...defaultJobFilters, location: 'Raleigh' }), false);
  assert.equal(matchesJobFilters(job, { ...defaultJobFilters, minSalary: '110000' }), false);
});

test('open-ended pay can satisfy a higher minimum and reversed bounds never match', () => {
  assert.equal(matchesJobFilters({ salary: '$90,000+' }, { ...defaultJobFilters, minSalary: '100000' }), true);
  assert.equal(matchesJobFilters({ salary: '$80,000–$130,000' }, { ...defaultJobFilters, minSalary: '120000', maxSalary: '100000' }), false);
});

test('entry-level title recognition separates level I, new grads, and internships', () => {
  for (const title of ['Software Engineer I', 'Data Analyst I', 'Software Engineer, New Grad', 'Analyst, Early Career']) {
    assert.equal(jobExperience({ title }), 'Entry-level', title);
  }
  assert.equal(jobExperience({ title: 'Software Engineer II' }), 'Unknown');
  assert.equal(jobExperience({ title: 'IT Engineer Intern (Early Careers)' }), 'Internship');
  assert.equal(jobExperience({ title: 'Senior Software Engineer I' }), 'Senior');
});

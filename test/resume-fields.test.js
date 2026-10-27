import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeFields } from '../server/services/resumeFields.js';
import { normalizeProfile, entryText } from '../src/data/profileFields.js';

test('separates individual work and project entries and extracts contact details', () => {
  const result = parseResumeFields(`Alex Chen
alex@example.com | (704) 555-1234
WORK EXPERIENCE
Data Intern | Example Inc | Jun 2025 - Aug 2025
• Built SQL reports
• Automated Python checks

Research Assistant | University | 2026 - Present
• Reviewed datasets
SELECTED PROJECTS
JobSwipe | 2026
• Built React forms
EDUCATION
B.S. Computer Science
CERTIFICATIONS
Cloud certificate`);
  assert.equal(result.phone, '(704) 555-1234');
  assert.equal(result.experienceEntries.length, 2);
  assert.equal(result.projectEntries.length, 1);
  assert.equal(result.experienceEntries[0].organization, 'Example Inc');
  assert.deepEqual(result.experienceEntries[0].bullets, ['Built SQL reports', 'Automated Python checks']);
  assert.match(result.projects, /JobSwipe/); assert.doesNotMatch(result.experience, /JobSwipe/);
});
test('handles missing fields and does not turn year ranges into phone numbers', () => {
  const result = parseResumeFields('Education\n2022 - 2026\nSkills\nPython, SQL');
  assert.equal(result.phone, ''); assert.equal(result.name, ''); assert.deepEqual(result.projectEntries, []);
  assert.equal(parseResumeFields('').experience, '');
});
test('old profiles retain their text when normalized', () => {
  const profile = normalizeProfile({ experience: 'Existing internship' });
  assert.equal(profile.experience, 'Existing internship'); assert.deepEqual(profile.experienceEntries[0].bullets, ['Existing internship']);
  assert.equal(entryText([{title:'Intern', bullets:['Built reports']}]), 'Intern\nBuilt reports');
});


test('inline headings, alternate headings, compact separators, and repeated entries stay categorized', () => {
  const result=parseResumeFields(`Name: Alex Chen
alex@example.com
Skills: Python, SQL
### EDUCATION AND TRAINING ###
B.S. Computer Science
Relevant Experience:
Data Intern|Example Inc|2025 - Present
• Built SQL reports
• Built SQL reports

Data Intern|Example Inc|2025 - Present
• Built SQL reports
Technical Projects:
JobSwipe|2026
• Built React forms
Professional Certifications: Cloud certificate`);
  assert.equal(result.name,'Alex Chen');assert.equal(result.email,'alex@example.com');
  assert.match(result.education,/B.S. Computer Science/);assert.equal(result.certifications,'Cloud certificate');
  assert.equal(result.experienceEntries.length,1);assert.deepEqual(result.experienceEntries[0].bullets,['Built SQL reports']);
  assert.equal(result.experienceEntries[0].organization,'Example Inc');assert.equal(result.projectEntries[0].title,'JobSwipe');
  assert.doesNotMatch(result.experience,/JobSwipe/);assert.match(result.skills,/Python/);
});

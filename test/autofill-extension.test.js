import test from 'node:test';
import assert from 'node:assert/strict';
import { customOrigin, pageKind, selections } from '../extension/settings.js';

test('only permits profile import on a trusted JobSwipe origin and filling on hosted Greenhouse jobs', () => {
  const origin = customOrigin('https://team.example.org/some/path');
  assert.equal(origin, 'https://team.example.org');
  assert.equal(pageKind('https://team.example.org/', origin), 'jobswipe');
  assert.equal(pageKind('http://127.0.0.1:5173/', origin), 'jobswipe');
  assert.equal(pageKind('https://job-boards.greenhouse.io/company/jobs/123#application-form', origin), 'application');
  for (const url of ['https://team.example.org.evil.test/', 'https://job-boards.greenhouse.io.evil.test/company/jobs/123',
    'https://job-boards.greenhouse.io/company', 'http://job-boards.greenhouse.io/company/jobs/123']) {
    assert.equal(pageKind(url, origin), 'unsupported');
  }
  assert.throws(() => customOrigin('https://user:pass@team.example.org'));
  assert.throws(() => customOrigin('https://job-boards.greenhouse.io'));
});

test('voluntary options are selected explicitly and protected veteran aliases retain their meaning', () => {
  assert.deepEqual(selections({ gender: '', veteran: 'I am not a veteran' }), []);
  const [gender, veteran] = selections({ gender: 'Man / Male', veteran: 'I am not a protected veteran' });
  assert.ok(gender.options.includes('I identify as a man'));
  assert.ok(!veteran.options.includes('I am not a veteran'));
  assert.deepEqual(veteran.contextual, {
    labels: ['are you a protected veteran', 'do you identify as a protected veteran'], value: 'No',
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSkills } from '../src/services/skillService.js';
test('skill separators preserve the letter n and multiword names', () => {
  assert.deepEqual(splitSkills('Python, Java; SQL\nSnowflake|Machine Learning, Pandas, scikit-learn, GitHub'),
    ['Python', 'Java', 'SQL', 'Snowflake', 'Machine Learning', 'Pandas', 'scikit-learn', 'GitHub']);
});

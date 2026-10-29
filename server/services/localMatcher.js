import { createHash } from 'node:crypto';
import { rankJobs, qualificationText } from './matching.js';

// Pin the artifact revision so cache entries cannot silently cross model versions.
export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
async function loadEncoder() {
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline('feature-extraction', MODEL, { revision: REVISION, dtype: 'q8' });
}
export function createLocalMatcher({ load = loadEncoder, version = `${MODEL}@${REVISION}:q8`, maxEntries = 2000 } = {}) {
  let encoder;
  const cache = new Map();
  async function embed(text) {
    const key = `${version}:${createHash('sha256').update(text).digest('hex')}`;
    if (cache.has(key)) return cache.get(key);
    encoder ||= Promise.resolve().then(load);
    const request = encoder.then(model => model(text, { pooling: 'mean', normalize: true }))
      .then(output => Array.from(output.data));
    cache.set(key, request);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    try { return await request; } catch (error) { cache.delete(key); throw error; }
  }
  return async function rank(profile, jobs) {
    const matches = rankJobs(profile, jobs);
    if (!matches.length) return { matches, source: 'keyword', message: '' };
    try {
      const text = ['skills', 'experience', 'projects', 'education', 'certifications', 'title']
        .map(field => qualificationText(profile[field])).join('\n').slice(0, 16000);
      const candidate = await embed(text);
      for (const match of matches) {
        const job = jobs.find(job => String(job.id) === String(match.jobId));
        const vector = await embed([job.title, ...(job.skills || []), job.description].join('\n').slice(0, 16000));
        if (!candidate.length || candidate.length !== vector.length || ![...candidate, ...vector].every(Number.isFinite)) throw new Error('Invalid embedding');
        const similarity = Math.max(0, Math.min(1, candidate.reduce((sum, value, i) => sum + value * vector[i], 0)));
        match.semanticScore = similarity;
        match.score = Math.round(100 * (0.6 * match.coverage + 0.4 * similarity));
      }
      matches.sort((a, b) => b.score - a.score || String(a.jobId).localeCompare(String(b.jobId)));
      return { matches, source: 'minilm', modelVersion: version, message: '' };
    } catch {
      encoder = undefined;
      return { matches: rankJobs(profile, jobs), source: 'keyword', message: 'MiniLM is unavailable. Results use keyword skill coverage.' };
    }
  };
}

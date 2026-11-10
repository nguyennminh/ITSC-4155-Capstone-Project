import { rankJobs, qualificationText } from './matching.js';
import { createEmbeddingClient } from './embeddingClient.js';
import { MODEL_VERSION, validVector } from './embeddingModel.js';
import { embeddingKey } from './embeddingCache.js';
export { MODEL, REVISION } from './embeddingModel.js';

// Cache operations must never hold up matching indefinitely when MongoDB is slow.
function bestEffort(operation, fallback = null) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation).catch(() => fallback),
    new Promise(resolve => { timer = setTimeout(() => resolve(fallback), 1800); }),
  ]).finally(() => clearTimeout(timer));
}

export function createLocalMatcher({ client = createEmbeddingClient(), persistentCache, version = MODEL_VERSION,
  maxEntries = 2000, mode = process.env.MATCHING_MODE || 'minilm' } = {}) {
  if (!['keyword', 'minilm'].includes(mode)) throw new Error('MATCHING_MODE must be keyword or minilm.');
  const cache = new Map();
  let busy = false, closed = false;
  async function embed(text, scope, ownerId, batch) {
    const key = embeddingKey(version, scope, text);
    if (cache.has(key)) return cache.get(key);
    const request = (async () => {
      const stored = batch.prefetched ? batch.prefetched.get(key)
        : persistentCache && await bestEffort(() => persistentCache.get(key));
      if (validVector(stored)) return stored;
      const vector = await client.embed(text);
      if (!validVector(vector)) throw new Error('Invalid embedding');
      if (persistentCache?.putMany) batch.writes.push({ key, vector, ownerId, version });
      else if (persistentCache) await bestEffort(() => persistentCache.put(key, vector, { ownerId, version }));
      return vector;
    })();
    cache.set(key, request);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    try { return await request; } catch (error) { cache.delete(key); throw error; }
  }
  const keyword = (matches, message = '') => ({ matches, source: 'keyword', message });
  async function rank(profile, jobs, { userId } = {}) {
    const matches = rankJobs(profile, jobs);
    if (mode === 'keyword' || closed || !matches.length) return keyword(matches);
    if (client.status() === 'idle') void client.start();
    if (client.status() !== 'ready') return keyword(matches, client.status() === 'loading'
      ? 'MiniLM is warming up. Results use keyword skill coverage. Refresh matches after it is ready.'
      : 'MiniLM is unavailable. Results use keyword skill coverage.');
    // Only one semantic ranking per instance. Other requests still get immediate keyword matches.
    if (busy) return keyword(matches, 'MiniLM is busy. Results use keyword skill coverage.');
    busy = true;
    const batch = { prefetched: null, writes: [] };
    try {
      const deadline = Date.now() + 12000;
      const text = ['skills', 'experience', 'projects', 'education', 'certifications', 'title']
        .map(field => qualificationText(profile[field])).join('\n').slice(0, 16000);
      // Production always supplies the authenticated user ID. Without it, do not persist profile data.
      const ownerId = userId == null ? null : String(userId);
      const byId = new Map(jobs.map(job => [String(job.id), job]));
      const jobText = job => [job.title, ...(job.skills || []), job.description].join('\n').slice(0, 16000);
      if (persistentCache?.getMany) {
        const keys = matches.map(match => embeddingKey(version, 'job', jobText(byId.get(String(match.jobId)))));
        if (ownerId) keys.push(embeddingKey(version, `user:${ownerId}`, text));
        const prefetched = await bestEffort(() => persistentCache.getMany(keys), new Map());
        batch.prefetched = prefetched instanceof Map ? prefetched : new Map();
      }
      const candidate = ownerId
        ? await embed(text, `user:${ownerId}`, ownerId, batch)
        : await client.embed(text);
      if (!validVector(candidate)) throw new Error('Invalid profile embedding');
      for (const match of matches) {
        if (Date.now() > deadline) throw new Error('Semantic ranking deadline exceeded');
        const job = byId.get(String(match.jobId));
        const vector = await embed(jobText(job), 'job', null, batch);
        const similarity = Math.max(0, Math.min(1, candidate.reduce((sum, value, i) => sum + value * vector[i], 0)));
        match.semanticScore = similarity;
        match.score = Math.round(100 * (0.6 * match.coverage + 0.4 * similarity));
      }
      matches.sort((a, b) => b.score - a.score || String(a.jobId).localeCompare(String(b.jobId)));
      return { matches, source: 'minilm', modelVersion: version, message: '' };
    } catch {
      return keyword(rankJobs(profile, jobs), 'MiniLM is unavailable. Results use keyword skill coverage.');
    } finally {
      if (batch.writes.length) await bestEffort(() => persistentCache.putMany(batch.writes));
      busy = false;
    }
  }
  rank.start = () => mode === 'minilm' && !closed ? client.start() : Promise.resolve(false);
  rank.status = () => mode === 'keyword' ? 'disabled' : client.status();
  rank.close = async () => { closed = true; cache.clear(); await client.close(); };
  return rank;
}

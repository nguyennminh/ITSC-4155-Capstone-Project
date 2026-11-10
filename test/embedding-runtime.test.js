import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createEmbeddingClient } from '../server/services/embeddingClient.js';
import { createLocalMatcher } from '../server/services/localMatcher.js';
import { createMongoEmbeddingCache, embeddingKey } from '../server/services/embeddingCache.js';
import { fixture } from './support/api.js';

const vector = () => [1, ...Array(383).fill(0)];
const profile = { skills: 'React', mode: 'Any', type: 'Any' };
const jobs = [{ id: 'a', title: 'Developer', skills: ['React'], mode: 'Unknown' }];
class FakeWorker extends EventEmitter {
  unref() {}
  terminate() { this.terminated = true; return Promise.resolve(); }
  postMessage(message) { this.last = message; }
}

test('warm-up is shared, and pending inference is rejected on worker exit', async () => {
  let count = 0;
  const worker = new FakeWorker();
  const client = createEmbeddingClient({ workerFactory: () => { count++; return worker; }, log: () => {} });
  const first = client.start();
  assert.equal(client.status(), 'loading');
  assert.equal(client.start(), first);
  worker.emit('message', { type: 'ready' });
  assert.equal(await first, true);
  assert.equal(count, 1);
  const request = client.embed('React');
  worker.emit('message', { id: worker.last.id, vector: vector() });
  assert.deepEqual(await request, vector());
  const rejected = assert.rejects(client.embed('Other'), /unavailable/);
  worker.emit('exit', 1);
  await rejected;
  assert.equal(client.status(), 'unavailable');
  assert.equal(await client.start(), false);
  await client.close();
});

test('inference timeout terminates the worker instead of allowing a growing queue', async () => {
  const worker = new FakeWorker();
  const client = createEmbeddingClient({ workerFactory: () => worker, inferenceTimeoutMs: 15, log: () => {} });
  const ready = client.start();
  worker.emit('message', { type: 'ready' });
  await ready;
  await assert.rejects(client.embed('React'), /unavailable/);
  assert.equal(worker.terminated, true);
  assert.equal(client.status(), 'unavailable');
});

test('a stalled warm-up is bounded and never starts a retry loop', async () => {
  const worker = new FakeWorker();
  let created = 0;
  const client = createEmbeddingClient({ workerFactory: () => { created++; return worker; }, startupTimeoutMs: 15, log: () => {} });
  const [ready] = await Promise.all([client.start(), new Promise(resolve => setTimeout(resolve, 30))]);
  assert.equal(ready, false);
  assert.equal(worker.terminated, true);
  assert.equal(await client.start(), false);
  assert.equal(created, 1);
});

test('another match request gets keyword results while semantic inference is busy', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const rank = createLocalMatcher({ mode: 'minilm', client: {
    status: () => 'ready', start: async () => true, close: async () => {},
    embed: async () => { await waiting; return vector(); },
  } });
  const first = rank(profile, jobs, { userId: 'alice' });
  const other = await rank(profile, jobs, { userId: 'bob' });
  assert.equal(other.source, 'keyword');
  assert.match(other.message, /busy/);
  release();
  assert.equal((await first).source, 'minilm');
  await rank.close();
});

test('a failed warm-up returns keyword results and keeps the API health endpoint available', async t => {
  const worker = new FakeWorker();
  const client = createEmbeddingClient({ workerFactory: () => worker, log: () => {} });
  const rank = createLocalMatcher({ mode: 'minilm', client });
  t.after(() => rank.close());
  const ready = rank.start();
  const { client: apiClient } = await fixture(t, { rank });
  const request = apiClient();
  const warming = await rank(profile, jobs);
  assert.equal(warming.source, 'keyword');
  assert.match(warming.message, /warming up/);
  assert.equal((await request('/api/health')).data.matching, 'loading');
  worker.emit('message', { type: 'unavailable' });
  assert.equal(await ready, false);
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await rank(profile, jobs)).matches.length, 1);
});

test('persistent cache survives matcher recreation and isolates users, text, and model versions', async () => {
  const rows = new Map();
  let embeds = 0;
  const persistentCache = { get: async key => rows.get(key)?.vector,
    put: async (key, vector, metadata) => rows.set(key, { vector, ...metadata }) };
  const create = (version = 'test-model') => createLocalMatcher({ mode: 'minilm', version, persistentCache,
    client: { status: () => 'ready', start: async () => true, close: async () => {},
      embed: async () => { embeds++; return vector(); } } });
  let rank = create();
  await rank(profile, jobs, { userId: 'alice' });
  assert.equal(embeds, 2);
  await rank.close();
  rank = create();
  assert.equal((await rank(profile, jobs, { userId: 'alice' })).source, 'minilm');
  assert.equal(embeds, 2);
  await rank(profile, jobs, { userId: 'bob' });
  assert.equal(embeds, 3); // Job vector is shared; profile vector is not.
  await rank({ ...profile, experience: 'New experience' }, jobs, { userId: 'alice' });
  assert.equal(embeds, 4);
  await rank.close();
  rank = create('new-model');
  await rank(profile, jobs, { userId: 'alice' });
  assert.equal(embeds, 6);
  await rank.close();
  assert.equal(embeddingKey('v1', 'user:a', 'text') === embeddingKey('v1', 'user:b', 'text'), false);
  assert.ok(!JSON.stringify([...rows.values()]).includes('New experience'));
});

test('cache failures and malformed cached vectors cannot prevent successful matching', async () => {
  const rank = createLocalMatcher({ mode: 'minilm',
    persistentCache: { get: async () => [NaN], put: async () => { throw Error('database offline'); } },
    client: { status: () => 'ready', start: async () => true, close: async () => {}, embed: async () => vector() } });
  assert.equal((await rank(profile, jobs, { userId: 'alice' })).source, 'minilm');
  await rank.close();
});

test('Mongo batch cache avoids one database round trip per embedding', async () => {
  const rows = new Map();
  let reads = 0, writes = 0, embeds = 0;
  const persistentCache = {
    getMany: async keys => { reads++; return new Map(keys.filter(key => rows.has(key)).map(key => [key, rows.get(key)])); },
    putMany: async entries => { writes++; for (const { key, vector } of entries) rows.set(key, vector); },
    get: async () => { throw Error('Single reads should not be needed'); },
  };
  const create = () => createLocalMatcher({ mode: 'minilm', persistentCache, client: {
    status: () => 'ready', close: async () => {}, start: async () => true,
    embed: async () => { embeds++; return vector(); },
  } });
  const first = create();
  assert.equal((await first(profile, jobs, { userId: 'alice' })).source, 'minilm');
  await first.close();
  assert.deepEqual([reads, writes, embeds], [1, 1, 2]);
  const second = create();
  assert.equal((await second(profile, jobs, { userId: 'alice' })).source, 'minilm');
  await second.close();
  assert.deepEqual([reads, writes, embeds], [2, 1, 2]);
});

test('Mongo cache stores only validated vectors, expires entries, and supports account cleanup', async () => {
  const indexes = [], documents = new Map();
  let deleted;
  const collection = {
    createIndex: async (...args) => indexes.push(args),
    findOne: async filter => {
      const row = documents.get(filter._id);
      return row?.expiresAt > filter.expiresAt.$gt ? row : null;
    },
    updateOne: async (filter, update) => documents.set(filter._id, update.$set),
    find: filter => ({ toArray: async () => [...documents].filter(([key, row]) => filter._id.$in.includes(key)
      && row.expiresAt > filter.expiresAt.$gt).map(([key, row]) => ({ _id: key, ...row })) }),
    bulkWrite: async writes => { for (const { updateOne: { filter, update } } of writes) documents.set(filter._id, update.$set); },
    deleteMany: async filter => { deleted = filter; },
  };
  const cache = await createMongoEmbeddingCache({ collection: name => { assert.equal(name, 'embedding_cache'); return collection; } });
  await cache.put('a', vector(), { ownerId: 'alice', version: 'v1' });
  assert.deepEqual(Object.keys(documents.get('a')).sort(), ['expiresAt', 'ownerId', 'vector', 'version']);
  assert.deepEqual(await cache.get('a'), vector());
  assert.deepEqual(await cache.getMany(['a', 'absent']), new Map([['a', vector()]]));
  await cache.putMany([{ key: 'batch', vector: vector(), ownerId: 'bob', version: 'v1' }, { key: 'bad', vector: [NaN] }]);
  assert.deepEqual(await cache.get('batch'), vector());
  documents.get('a').expiresAt = new Date(0);
  assert.equal(await cache.get('a'), null);
  await cache.put('bad', [0]);
  assert.equal(documents.has('bad'), false);
  await cache.deleteForUser('alice');
  assert.deepEqual(deleted, { ownerId: 'alice' });
  assert.ok(indexes.some(([key, options]) => key.expiresAt && options.expireAfterSeconds === 0));
});

import { createHash } from 'node:crypto';
import { validVector } from './embeddingModel.js';

export function embeddingKey(version, scope, text) {
  return createHash('sha256').update(JSON.stringify([version, scope, text])).digest('hex');
}

// Cache only vectors and identifiers, never resume text. Profile vectors are account-scoped.
export async function createMongoEmbeddingCache(db) {
  const collection = db.collection('embedding_cache');
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await collection.createIndex({ ownerId: 1 });
  return {
    async get(key) {
      const row = await collection.findOne({ _id: key, expiresAt: { $gt: new Date() } }, { maxTimeMS: 1500 });
      return validVector(row?.vector) ? row.vector : null;
    },
    async getMany(keys) {
      const rows = await collection.find({ _id: { $in: keys }, expiresAt: { $gt: new Date() } }, { maxTimeMS: 1500 }).toArray();
      return new Map(rows.filter(row => validVector(row.vector)).map(row => [row._id, row.vector]));
    },
    async put(key, vector, { ownerId = null, version } = {}) {
      if (!validVector(vector)) return;
      await collection.updateOne({ _id: key }, { $set: { vector, ownerId, version,
        expiresAt: new Date(Date.now() + 30 * 86400000) } }, { upsert: true, maxTimeMS: 1500 });
    },
    async putMany(entries) {
      const writes = entries.filter(entry => validVector(entry.vector)).map(({ key, vector, ownerId = null, version }) => ({
        updateOne: { filter: { _id: key }, update: { $set: { vector, ownerId, version,
          expiresAt: new Date(Date.now() + 30 * 86400000) } }, upsert: true },
      }));
      if (writes.length) await collection.bulkWrite(writes, { ordered: false, maxTimeMS: 1500 });
    },
    deleteForUser: ownerId => collection.deleteMany({ ownerId }),
  };
}

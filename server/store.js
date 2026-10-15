import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { emptyProfile } from '../src/data/mockData.js';
import { sqliteGoogleStore, mongoGoogleStore } from './googleStore.js';

export function openStore(filename = process.env.DB_PATH || 'server/data/jobswipe.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS applications (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL, job_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Started',
      started_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, job_id)
    );
    CREATE TABLE IF NOT EXISTS saved_jobs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL, job_json TEXT NOT NULL, saved_at TEXT NOT NULL,
      PRIMARY KEY(user_id, job_id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL, profile_json TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resume_drafts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      result_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resumes (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL, content_type TEXT NOT NULL, data BLOB NOT NULL,
      saved_at TEXT NOT NULL
    );`);
  const store = {
    close: () => db.close(),
    applications(id) {
      return db.prepare('SELECT * FROM applications WHERE user_id=? ORDER BY started_at DESC').all(id)
        .map(row => ({ ...JSON.parse(row.job_json), id: row.job_id, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at }));
    },
    savedJobs(id) {
      return db.prepare('SELECT * FROM saved_jobs WHERE user_id=? ORDER BY saved_at DESC').all(id)
        .map(row => JSON.parse(row.job_json));
    },
    saveJob(id, job) {
      db.prepare('INSERT INTO saved_jobs VALUES(?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET job_json=excluded.job_json')
        .run(id, String(job.id), JSON.stringify(job), new Date().toISOString());
    },
    removeSavedJob(id, jobId) {
      return db.prepare('DELETE FROM saved_jobs WHERE user_id=? AND job_id=?').run(id, jobId).changes;
    },
    startApplication(id, job) {
      const date = new Date().toISOString();
      db.prepare('INSERT INTO applications VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,job_id) DO NOTHING')
        .run(id, String(job.id), JSON.stringify(job), 'Started', date, date);
    },
    updateApplication(id, jobId, status) {
      return db.prepare('UPDATE applications SET status=?,updated_at=? WHERE user_id=? AND job_id=?')
        .run(status, new Date().toISOString(), id, jobId).changes;
    },
    findUser: email => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    createUser(email, passwordHash, name, role) {
      const profile = { ...emptyProfile, name, email };
      // Let the unique constraint arbitrate simultaneous registrations.
      const result = db.prepare('INSERT INTO users(email,password_hash,role,profile_json) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id')
        .get(email, passwordHash, role, JSON.stringify(profile));
      return result ? Number(result.id) : null;
    },
    user: id => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
    saveProfile(id, profile) {
      db.prepare('UPDATE users SET profile_json = ?, confirmed = 1 WHERE id = ?').run(JSON.stringify(profile), id);
    },
    saveDraft(id, result) {
      db.prepare('INSERT INTO resume_drafts(user_id,result_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET result_json=excluded.result_json')
        .run(id, JSON.stringify(result));
    },
    draft(id) {
      const row = db.prepare('SELECT result_json FROM resume_drafts WHERE user_id = ?').get(id);
      return row ? JSON.parse(row.result_json) : null;
    },
    deleteDraft(id) { db.prepare('DELETE FROM resume_drafts WHERE user_id = ?').run(id); },
    saveResume(id, resume) {
      db.prepare(`INSERT INTO resumes VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
        original_name=excluded.original_name,content_type=excluded.content_type,data=excluded.data,saved_at=excluded.saved_at`)
        .run(id, resume.originalname, resume.mimetype, resume.buffer, new Date().toISOString());
    },
    resume(id) {
      const row = db.prepare('SELECT * FROM resumes WHERE user_id = ?').get(id);
      return row ? { name: row.original_name, contentType: row.content_type, buffer: row.data, savedAt: row.saved_at } : null;
    },
    deleteResume(id) {
      db.prepare('DELETE FROM resumes WHERE user_id = ?').run(id);
      const row = db.prepare('SELECT profile_json FROM users WHERE id = ?').get(id);
      if (row) db.prepare('UPDATE users SET profile_json = ? WHERE id = ?')
        .run(JSON.stringify({ ...JSON.parse(row.profile_json), resumeName: '' }), id);
    },
    addSession(hash, id, expires) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash, id, expires);
    },
    sessionUser(hash) {
      return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?')
        .get(hash, Date.now());
    },
    deleteSession(hash) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash); },
  };
  return Object.assign(store, sqliteGoogleStore(db, store));
}

export async function connectMongoStore(uri = process.env.MONGODB_URI, databaseName = process.env.DB_NAME || 'jobswipe') {
  if (!uri) throw new Error('MONGODB_URI must be configured to use persistent MongoDB storage.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(databaseName);
  const users = db.collection('users');
  const applications = db.collection('applications');
  const savedJobs = db.collection('saved_jobs');
  const sessions = db.collection('sessions');
  const drafts = db.collection('resume_drafts');
  const resumes = db.collection('resumes');

  try {
    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      applications.createIndex({ user_id: 1, job_id: 1 }, { unique: true }),
      savedJobs.createIndex({ user_id: 1, job_id: 1 }, { unique: true }),
      sessions.createIndex({ token_hash: 1 }, { unique: true }),
      sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
      drafts.createIndex({ user_id: 1 }, { unique: true }),
      resumes.createIndex({ user_id: 1 }, { unique: true }),
    ]);
  } catch (error) {
    await client.close();
    throw error;
  }

  const mapUser = document => document ? { ...document, id: document._id } : undefined;
  let google;
  try { google = await mongoGoogleStore(db, client, mapUser); }
  catch (error) { await client.close(); throw error; }
  return {
    ...google,
    close: () => client.close(),
    async applications(id) {
      const rows = await applications.find({ user_id: id }).sort({ started_at: -1 }).toArray();
      return rows.map(row => ({ ...row.job_json, id: row.job_id, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at }));
    },
    async savedJobs(id) {
      const rows = await savedJobs.find({ user_id: id }).sort({ saved_at: -1 }).toArray();
      return rows.map(row => row.job_json);
    },
    async saveJob(id, job) {
      await savedJobs.updateOne(
        { user_id: id, job_id: String(job.id) },
        { $set: { job_json: job }, $setOnInsert: { saved_at: new Date().toISOString() } },
        { upsert: true },
      );
    },
    async removeSavedJob(id, jobId) {
      return (await savedJobs.deleteOne({ user_id: id, job_id: jobId })).deletedCount;
    },
    async startApplication(id, job) {
      const date = new Date().toISOString();
      await applications.updateOne(
        { user_id: id, job_id: String(job.id) },
        { $setOnInsert: { job_json: job, status: 'Started', started_at: date, updated_at: date } },
        { upsert: true },
      );
    },
    async updateApplication(id, jobId, status) {
      return (await applications.updateOne(
        { user_id: id, job_id: jobId },
        { $set: { status, updated_at: new Date().toISOString() } },
      )).matchedCount;
    },
    findUser: async email => mapUser(await users.findOne({ email })),
    async createUser(email, passwordHash, name, role) {
      const profile = { ...emptyProfile, name, email };
      const id = randomUUID();
      try {
        await users.insertOne({ _id: id, email, password_hash: passwordHash, role,
          profile_json: JSON.stringify(profile), confirmed: 0 });
        return id;
      } catch (error) {
        if (error.code === 11000) return null;
        throw error;
      }
    },
    user: async id => mapUser(await users.findOne({ _id: id })),
    async saveProfile(id, profile) {
      await users.updateOne({ _id: id }, { $set: { profile_json: JSON.stringify(profile), confirmed: 1 } });
    },
    async saveDraft(id, result) {
      await drafts.updateOne({ user_id: id }, { $set: { result_json: JSON.stringify(result) } }, { upsert: true });
    },
    async draft(id) {
      const row = await drafts.findOne({ user_id: id });
      return row ? JSON.parse(row.result_json) : null;
    },
    async deleteDraft(id) { await drafts.deleteOne({ user_id: id }); },
    async saveResume(id, resume) {
      await resumes.updateOne(
        { user_id: id },
        { $set: { original_name: resume.originalname, content_type: resume.mimetype, data: resume.buffer, saved_at: new Date().toISOString() } },
        { upsert: true },
      );
    },
    async resume(id) {
      const row = await resumes.findOne({ user_id: id });
      const buffer = row && (Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data.value(true)));
      return row ? { name: row.original_name, contentType: row.content_type, buffer, savedAt: row.saved_at } : null;
    },
    async deleteResume(id) {
      await resumes.deleteOne({ user_id: id });
      const user = await users.findOne({ _id: id }, { projection: { profile_json: 1 } });
      if (user) {
        const profile = JSON.parse(user.profile_json);
        await users.updateOne({ _id: id }, { $set: { profile_json: JSON.stringify({ ...profile, resumeName: '' }) } });
      }
    },
    async addSession(hash, id, expires) {
      await sessions.deleteMany({ expires_at: { $lte: new Date() } });
      await sessions.insertOne({ token_hash: hash, user_id: id, expires_at: new Date(expires) });
    },
    async sessionUser(hash) {
      return mapUser(await sessions.aggregate([
        { $match: { token_hash: hash, expires_at: { $gt: new Date() } } },
        { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $replaceWith: '$user' },
        { $limit: 1 },
      ]).next());
    },
    async deleteSession(hash) { await sessions.deleteOne({ token_hash: hash }); },
  };
}

export function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role,
    profile: JSON.parse(user.profile_json), confirmed: Boolean(user.confirmed) };
}

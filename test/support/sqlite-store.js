// Isolated test adapter. The running JobSwipe server always uses MongoDB.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyProfile } from '../../src/data/mockData.js';
import { sqliteGoogleStore } from './sqlite-google-store.js';

export function openStore(filename = ':memory:') {
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

    deleteApplication(id, jobId) {
      return db.prepare('DELETE FROM applications WHERE user_id=? AND job_id=?')
        .run(id, jobId).changes;
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
    deleteAccount(id) {
      return db.prepare('DELETE FROM users WHERE id=?').run(id).changes;
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

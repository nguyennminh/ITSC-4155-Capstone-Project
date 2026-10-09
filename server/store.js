import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyProfile } from '../src/data/mockData.js';

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
    );`);
  return {
    close: () => db.close(),
    applications(id) {
      return db.prepare('SELECT * FROM applications WHERE user_id=? ORDER BY started_at DESC').all(id)
        .map(row => ({ ...JSON.parse(row.job_json), id: row.job_id, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at }));
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
      const result = db.prepare('INSERT INTO users(email,password_hash,role,profile_json) VALUES(?,?,?,?)')
        .run(email, passwordHash, role, JSON.stringify(profile));
      return Number(result.lastInsertRowid);
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
}

export function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role,
    profile: JSON.parse(user.profile_json), confirmed: Boolean(user.confirmed) };
}

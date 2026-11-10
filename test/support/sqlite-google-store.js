// SQLite fixture implementation of the same account linking rules.
import { decide, expiredError } from '../../server/googleStore.js';

export function sqliteGoogleStore(db, store) {
  if (db.prepare('PRAGMA user_version').get().user_version < 1) {
    db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    try {
      db.exec(`CREATE TABLE users_v1 (
        id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
        role TEXT NOT NULL, profile_json TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO users_v1 SELECT id,email,password_hash,role,profile_json,confirmed FROM users;
      DROP TABLE users;
      ALTER TABLE users_v1 RENAME TO users;
      PRAGMA user_version = 1;`);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Authentication migration failed foreign-key validation.');
      db.exec('COMMIT;');
    } catch (error) { db.exec('ROLLBACK;'); db.close(); throw error; }
    db.exec('PRAGMA foreign_keys = ON;');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS google_identities (
      subject TEXT PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS google_attempts (
      token_hash TEXT PRIMARY KEY, nonce_hash TEXT, claims_json TEXT, expires_at INTEGER NOT NULL
    );`);
  const methods = {
    googleUser: subject => db.prepare('SELECT users.* FROM users JOIN google_identities ON users.id=google_identities.user_id WHERE subject=?').get(subject),
    googleIdentity: id => db.prepare('SELECT subject FROM google_identities WHERE user_id=?').get(id),
    startGoogleAttempt(previousHash, tokenHash, nonceHash, expires) {
      db.exec('BEGIN IMMEDIATE;');
      try {
        db.prepare('DELETE FROM google_attempts WHERE token_hash=? OR expires_at<=?').run(previousHash, Date.now());
        db.prepare('INSERT INTO google_attempts(token_hash,nonce_hash,expires_at) VALUES(?,?,?)').run(tokenHash, nonceHash, expires);
        db.exec('COMMIT;');
      } catch (error) { db.exec('ROLLBACK;'); throw error; }
    },
    googleAttempt: tokenHash => db.prepare('SELECT * FROM google_attempts WHERE token_hash=? AND expires_at>?').get(tokenHash, Date.now()),
    verifyGoogleAttempt(tokenHash, nonceHash, claims) {
      return db.prepare('UPDATE google_attempts SET nonce_hash=NULL,claims_json=? WHERE token_hash=? AND nonce_hash=? AND expires_at>?')
        .run(JSON.stringify(claims), tokenHash, nonceHash, Date.now()).changes === 1;
    },
    completeGoogleAttempt(tokenHash, profile, proof) {
      db.exec('BEGIN IMMEDIATE;');
      try {
        const attempt = methods.googleAttempt(tokenHash);
        let result = { expired: true };
        if (attempt?.claims_json && !attempt.nonce_hash) {
          const claims = JSON.parse(attempt.claims_json);
          const user = store.findUser(claims.email);
          result = decide(claims, methods.googleUser(claims.subject), user,
            user && methods.googleIdentity(user.id), profile, proof);
          if (result.create || result.link) {
            const id = result.link?.id ?? store.createUser(claims.email, null, profile.name, profile.role);
            db.prepare('INSERT INTO google_identities(subject,user_id) VALUES(?,?)').run(claims.subject, id);
            result = { user: store.user(id) };
          }
          if (result.user && !db.prepare('DELETE FROM google_attempts WHERE token_hash=? AND expires_at>?').run(tokenHash, Date.now()).changes) {
            throw expiredError();
          }
        }
        db.exec('COMMIT;');
        return result;
      } catch (error) {
        db.exec('ROLLBACK;');
        if (error.code === 'GOOGLE_ATTEMPT_EXPIRED') return { expired: true };
        throw error;
      }
    },
  };
  return methods;
}

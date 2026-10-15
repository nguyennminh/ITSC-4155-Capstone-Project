import { randomUUID } from 'node:crypto';
import { emptyProfile } from '../src/data/mockData.js';

const expiredError = () => Object.assign(new Error('Google attempt expired during completion.'), { code: 'GOOGLE_ATTEMPT_EXPIRED' });

// Both adapters make identity attachment and attempt consumption one atomic
// operation. A password proof is bound to the exact account and hash checked.
function decide(claims, linked, user, identity, profile, proof) {
  if (linked) return { user: linked };
  if (user) {
    if (identity || !user.password_hash) return { conflict: true };
    if (!proof || proof.id !== user.id || proof.passwordHash !== user.password_hash) {
      return { nextStep: 'confirm_password', email: claims.email, name: claims.name };
    }
    return { link: user };
  }
  if (!profile) return { nextStep: 'complete_profile', email: claims.email, name: claims.name };
  return { create: true };
}

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

export async function mongoGoogleStore(db, client, mapUser) {
  const users = db.collection('users');
  const identities = db.collection('google_identities');
  const attempts = db.collection('google_attempts');
  await Promise.all([
    identities.createIndex({ subject: 1 }, { unique: true }),
    identities.createIndex({ user_id: 1 }, { unique: true }),
    attempts.createIndex({ token_hash: 1 }, { unique: true }),
    attempts.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return {
    async googleUser(subject) {
      const identity = await identities.findOne({ subject });
      return identity ? mapUser(await users.findOne({ _id: identity.user_id })) : undefined;
    },
    googleIdentity: id => identities.findOne({ user_id: id }),
    async startGoogleAttempt(previousHash, tokenHash, nonceHash, expires) {
      await attempts.deleteMany({ $or: [{ token_hash: previousHash }, { expires_at: { $lte: new Date() } }] });
      await attempts.insertOne({ token_hash: tokenHash, nonce_hash: nonceHash, claims_json: null, expires_at: new Date(expires) });
    },
    googleAttempt: tokenHash => attempts.findOne({ token_hash: tokenHash, expires_at: { $gt: new Date() } }),
    async verifyGoogleAttempt(tokenHash, nonceHash, claims) {
      return (await attempts.updateOne({ token_hash: tokenHash, nonce_hash: nonceHash, expires_at: { $gt: new Date() } },
        { $set: { nonce_hash: null, claims_json: JSON.stringify(claims) } })).modifiedCount === 1;
    },
    async completeGoogleAttempt(tokenHash, profile, proof) {
      // Unique indexes can arbitrate concurrent inserts with a duplicate-key
      // error instead of a transient-transaction label. Retry to read the winner.
      for (let retry = 0; ; retry++) {
        try {
          return await client.withSession(session => session.withTransaction(async () => {
            const options = { session };
            const attempt = await attempts.findOne({ token_hash: tokenHash, expires_at: { $gt: new Date() } }, options);
            if (!attempt?.claims_json || attempt.nonce_hash) return { expired: true };
            const claims = JSON.parse(attempt.claims_json);
            const identity = await identities.findOne({ subject: claims.subject }, options);
            const linked = identity ? mapUser(await users.findOne({ _id: identity.user_id }, options)) : undefined;
            const user = mapUser(await users.findOne({ email: claims.email }, options));
            const otherIdentity = user ? await identities.findOne({ user_id: user.id }, options) : undefined;
            let result = decide(claims, linked, user, otherIdentity, profile, proof);
            if (result.create || result.link) {
              let account = result.link;
              if (!account) {
                account = { _id: randomUUID(), email: claims.email, password_hash: null, role: profile.role,
                  profile_json: JSON.stringify({ ...emptyProfile, name: profile.name, email: claims.email }), confirmed: 0 };
                await users.insertOne(account, options);
                account = mapUser(account);
              }
              await identities.insertOne({ subject: claims.subject, user_id: account.id }, options);
              result = { user: account };
            }
            if (result.user) {
              // Expiry is checked again after the transactional reads/writes.
              const consumed = await attempts.deleteOne({ token_hash: tokenHash, expires_at: { $gt: new Date() } }, options);
              if (!consumed.deletedCount) throw expiredError();
            }
            return result;
          }));
        } catch (error) {
          if (error.code === 'GOOGLE_ATTEMPT_EXPIRED') return { expired: true };
          if (error.code !== 11000 || retry >= 2) throw error;
        }
      }
    },
  };
}

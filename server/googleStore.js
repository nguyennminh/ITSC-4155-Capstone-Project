import { randomUUID } from 'node:crypto';
import { emptyProfile } from '../src/data/mockData.js';

export const expiredError = () => Object.assign(new Error('Google attempt expired during completion.'), { code: 'GOOGLE_ATTEMPT_EXPIRED' });

// Both adapters make identity attachment and attempt consumption one atomic
// operation. A password proof is bound to the exact account and hash checked.
export function decide(claims, linked, user, identity, profile, proof) {
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

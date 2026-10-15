import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { ApiError } from './services/aiMatcher.js';
import { issueSession, verifyPassword } from './auth.js';
import { publicUser } from './store.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const cookieName = 'jobswipe_google_attempt';
const duration = 5 * 60 * 1000;
const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production', path: '/api/auth/google' });
const attemptHash = req => {
  const token = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token ? digest(token) : '';
};
const profileSchema = z.object({ name: z.string().trim().min(1).max(100), role: z.enum(['Job seeker', 'Recruiter']) });
const credentialSchema = z.object({ credential: z.string().min(1).max(16000) });
const passwordSchema = z.object({ password: z.string().min(10).max(128) });
const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const expired = () => new ApiError(401, 'Google sign-in expired. Please start again.');

export function createGoogleVerifier(clientId, client = new OAuth2Client()) {
  return async credential => {
    let timeout;
    try {
      const ticket = await Promise.race([
        client.verifyIdToken({ idToken: credential, audience: clientId }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Object.assign(new Error('Verification timed out'), { code: 'ETIMEDOUT' })), 10000);
          timeout.unref?.();
        }),
      ]);
      return ticket.getPayload();
    } catch (error) {
      const unavailable = ['ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED'].includes(error.code)
        || error.response?.status >= 500 || error.response?.status === 429;
      throw new ApiError(unavailable ? 503 : 401, unavailable
        ? 'Google sign-in is temporarily unavailable. Please retry.' : 'Could not verify Google sign-in. Please start again.');
    } finally { clearTimeout(timeout); }
  };
}

export function installGoogleAuth(app, { store, authAttempts, clientId = process.env.GOOGLE_CLIENT_ID,
  verify = createGoogleVerifier(clientId) }) {
  app.use('/api/auth/google', (req, res, next) => {
    if (req.method !== 'POST') return next();
    const allowed = process.env.APP_ORIGINS ? process.env.APP_ORIGINS.split(',').map(value => value.trim())
      : ['http://localhost:5173', 'http://127.0.0.1:5173', `${req.protocol}://${req.get('host')}`];
    if (!allowed.includes(req.headers.origin)) throw new ApiError(403, 'Origin not allowed.');
    if (!req.is('application/json')) throw new ApiError(415, 'Send a JSON request.');
    next();
  }, (req, res, next) => clientId ? authAttempts(req, res, next) : next());

  app.post('/api/auth/google/start', async (req, res) => {
    if (!clientId) return res.json({ enabled: false });
    const token = randomBytes(32).toString('hex');
    const nonce = randomBytes(32).toString('hex');
    await store.startGoogleAttempt(attemptHash(req), digest(token), digest(nonce), Date.now() + duration);
    res.cookie(cookieName, token, { ...cookieOptions(), maxAge: duration });
    res.json({ enabled: true, clientId, nonce });
  });

  const getAttempt = async req => {
    if (!clientId) throw new ApiError(503, 'Google sign-in is not configured.');
    const hash = attemptHash(req);
    const attempt = await store.googleAttempt(hash);
    if (!attempt) throw expired();
    return { hash, attempt };
  };
  const respond = async (req, res, result) => {
    if (result.expired) throw expired();
    if (result.conflict) throw new ApiError(409, 'This email is associated with a different Google account. Use your original sign-in method.');
    if (!result.user) return res.status(202).json(result);
    await issueSession(req, res, store, result.user.id);
    res.clearCookie(cookieName, cookieOptions());
    return res.json({ user: publicUser(result.user) });
  };

  app.post('/api/auth/google', async (req, res) => {
    const { hash, attempt } = await getAttempt(req);
    if (!attempt.nonce_hash) throw expired();
    const parsed = credentialSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'A Google credential is required.');
    const payload = await verify(parsed.data.credential);
    const email = emailSchema.safeParse(payload?.email);
    // In addition to the library's signature verification, enforce our client,
    // verified email, subject and browser-bound nonce before storing any claims.
    if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
      || payload.aud !== clientId || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()
      || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
      || payload.email_verified !== true || !email.success
      || typeof payload.nonce !== 'string' || digest(payload.nonce) !== attempt.nonce_hash) {
      throw new ApiError(401, 'Could not verify Google sign-in. Please start again.');
    }
    const claims = { subject: payload.sub, email: email.data,
      name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 100) : '' };
    if (!await store.verifyGoogleAttempt(hash, attempt.nonce_hash, claims)) throw expired();
    return respond(req, res, await store.completeGoogleAttempt(hash, null, null));
  });

  app.post('/api/auth/google/complete', async (req, res) => {
    const { hash, attempt } = await getAttempt(req);
    if (!attempt.claims_json || attempt.nonce_hash) throw expired();
    const claims = JSON.parse(attempt.claims_json);
    const existing = await store.findUser(claims.email);
    const profile = profileSchema.safeParse(req.body);
    let proof = null;
    if (existing && (!existing.password_hash || await store.googleIdentity(existing.id))) {
      return respond(req, res, await store.completeGoogleAttempt(hash, null, null));
    }
    if (existing && Object.hasOwn(req.body || {}, 'password')) {
      const parsed = passwordSchema.safeParse(req.body);
      if (!parsed.success) throw new ApiError(400, 'Enter your existing password of 10–128 characters to link Google.');
      if (!await verifyPassword(parsed.data.password, existing.password_hash)) throw new ApiError(401, 'Incorrect email or password.');
      proof = { id: existing.id, passwordHash: existing.password_hash };
    } else if (!profile.success) {
      throw new ApiError(400, existing ? 'Enter your existing password of 10–128 characters to link Google.'
        : 'Enter a name and choose Job seeker or Recruiter.');
    }
    return respond(req, res, await store.completeGoogleAttempt(hash, profile.success ? profile.data : null, proof));
  });
}

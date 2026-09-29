import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const lifetime = 7 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, value] = stored.split(':');
  const expected = Buffer.from(value, 'hex');
  const actual = await derive(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function sessionHash(req) {
  const token = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith('jobswipe_session='))?.slice('jobswipe_session='.length);
  return token ? hash(token) : '';
}
export function issueSession(req, res, store, userId) {
  store.deleteSession(sessionHash(req));
  const token = randomBytes(32).toString('hex');
  store.addSession(hash(token), userId, Date.now() + lifetime);
  res.cookie('jobswipe_session', token, { httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production', path: '/', maxAge: lifetime });
}
export function clearSession(req, res, store) {
  store.deleteSession(sessionHash(req));
  res.clearCookie('jobswipe_session', { httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production', path: '/' });
}

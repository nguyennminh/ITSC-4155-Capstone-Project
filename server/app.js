import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { jobs } from '../src/data/mockData.js';
import { extractText } from './services/extractText.js';
import { parseResumeFields } from './services/resumeFields.js';
import { ApiError, matchJobs } from './services/aiMatcher.js';
import { rankJobs } from './services/matching.js';
import { openStore, publicUser } from './store.js';
import { hashPassword, verifyPassword, sessionHash, issueSession, clearSession } from './auth.js';

const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) });
const registerSchema = loginSchema.extend({ name: z.string().trim().min(1).max(100), role: z.enum(['Job seeker', 'Recruiter']).default('Job seeker') });
const profileSchema = z.object({
  name: z.string().trim().min(1).max(100), email: z.union([z.literal(''), z.string().email()]),
  skills: z.string().trim().max(12000), experience: z.string().trim().max(12000),
  education: z.string().trim().max(12000), certifications: z.string().trim().max(12000),
  title: z.string().trim().max(200), location: z.string().trim().max(200),
  mode: z.enum(['Any', 'Remote', 'Hybrid', 'On-site']),
  type: z.enum(['Any', 'Full-time', 'Part-time', 'Internship', 'Contract']),
  resumeName: z.string().max(255).default(''),
});
export function createApp({ store = openStore(), extract = extractText, explain = matchJobs } = {}) {
  const app = express();
  app.locals.store = store;
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const allowed = new Set((process.env.APP_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','));
    if (req.headers.origin && !allowed.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed.' });
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Wait a minute and retry.' } }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY) }));
  app.use('/api/auth', rateLimit({ windowMs: 60000, limit: 20, message: { error: 'Too many sign-in attempts. Wait a minute.' } }));
  app.post('/api/auth/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Enter a name, valid email, and a password of 10–128 characters.');
    const { name, email, password, role } = parsed.data;
    if (store.findUser(email)) throw new ApiError(409, 'An account with that email already exists.');
    const passwordHash = await hashPassword(password);
    if (store.findUser(email)) throw new ApiError(409, 'An account with that email already exists.');
    const id = store.createUser(email, passwordHash, name, role);
    issueSession(req, res, store, id);
    res.status(201).json({ user: publicUser(store.user(id)) });
  });
  app.post('/api/auth/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Enter a valid email and password.');
    const user = store.findUser(parsed.data.email);
    if (!user || !await verifyPassword(parsed.data.password, user.password_hash)) throw new ApiError(401, 'Incorrect email or password.');
    issueSession(req, res, store, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => { clearSession(req, res, store); res.json({ ok: true }); });
  app.get('/api/auth/me', (req, res) => {
    const user = store.sessionUser(sessionHash(req));
    res.json({ user: user ? publicUser(user) : null });
  });
  // All resume/profile/matching routes derive ownership from the session, not request user IDs.
  app.use('/api', (req, res, next) => {
    req.user = store.sessionUser(sessionHash(req));
    if (!req.user) return res.status(401).json({ error: 'Sign in to access your resume and profile.' });
    next();
  });
  app.get('/api/profile', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/profile/confirm', (req, res) => {
    const parsed = z.object({ confirmed: z.literal(true), profile: profileSchema }).safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Review and confirm valid profile fields before saving.');
    store.saveProfile(req.user.id, parsed.data.profile);
    // Reviewed draft has been consumed. The saved confirmed fields are now authoritative.
    store.deleteDraft(req.user.id);
    res.json({ user: publicUser(store.user(req.user.id)) });
  });
  app.get('/api/resumes/latest', (req, res) => res.json({ draft: store.draft(req.user.id) }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  app.post('/api/resumes/parse', upload.single('resume'), async (req, res) => {
    let rawText;
    try { rawText = await extract(req.file); }
    catch (error) { throw new ApiError(422, error.message); }
    const result = { fields: parseResumeFields(rawText), rawText, resumeName: req.file.originalname,
      warnings: ['Review all extracted fields. Skills and section headings may be missed; this parser is rule-based.'] };
    store.saveDraft(req.user.id, result);
    res.json(result);
  });
  app.post('/api/jobs/match', async (req, res) => {
    if (!req.user.confirmed) throw new ApiError(409, 'Confirm your profile before matching jobs.');
    const request = z.object({ useAi: z.boolean().default(false) }).safeParse(req.body || {});
    if (!request.success) throw new ApiError(400, 'Invalid matching request.');
    const profile = JSON.parse(req.user.profile_json);
    let matches = rankJobs(profile, jobs);
    let warning = '';
    if (request.data.useAi && matches.length) {
      try {
        const { skills, experience, education, certifications, title, location, mode, type } = profile;
        const eligible = jobs.filter(job => matches.some(match => match.jobId === job.id));
        const explanations = await explain({ skills, experience, education, certifications, title, location, mode, type }, eligible);
        matches = matches.map(match => ({ ...match, aiReasons: explanations.find(item => item.jobId === match.jobId)?.reasons || [] }));
      } catch { warning = 'Gemini explanations are unavailable. Your consistent matching scores are still shown.'; }
    }
    res.json({ matches, warning, source: 'deterministic', sampleJobs: true,
      message: matches.length ? '' : 'No jobs match your confirmed qualifications and preferences. Update your profile or broaden your preferences.' });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Upload one PDF or DOCX file, 10 MB or smaller, in the resume field.' });
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' });
    res.status(500).json({ error: 'Something went wrong. Please retry.' });
  });
  return app;
}

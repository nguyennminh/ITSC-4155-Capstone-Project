import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createJobProvider } from './services/jobProvider.js';
import { safeExternalUrl } from '../src/services/linkService.js';
import { extractText } from './services/extractText.js';
import { parseResumeFields } from './services/resumeFields.js';
import { ApiError, matchJobs } from './services/aiMatcher.js';
import { openStore, publicUser } from './store.js';
import { hashPassword, verifyPassword, sessionHash, issueSession, clearSession } from './auth.js';
import { installGoogleAuth } from './googleAuth.js';

const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) });
const registerSchema = loginSchema.extend({ name: z.string().trim().min(1).max(100), role: z.enum(['Job seeker', 'Recruiter']).default('Job seeker') });
const entrySchema = z.object({ title: z.string().trim().max(200), organization: z.string().trim().max(200), dates: z.string().trim().max(100), bullets: z.array(z.string().max(6000)).max(50) });
const profileSchema = z.object({
  phone: z.string().trim().max(40).optional(), projects: z.string().trim().max(12000).optional(),
  experienceEntries: z.array(entrySchema).max(20).optional(), projectEntries: z.array(entrySchema).max(20).optional(),
  name: z.string().trim().min(1).max(100), email: z.union([z.literal(''), z.string().email()]),
  skills: z.string().trim().max(12000), experience: z.string().trim().max(12000),
  education: z.string().trim().max(12000), certifications: z.string().trim().max(12000),
  title: z.string().trim().max(200), location: z.string().trim().max(200),
  mode: z.enum(['Any', 'Remote', 'Hybrid', 'On-site']),
  type: z.enum(['Any', 'Full-time', 'Part-time', 'Internship', 'Contract']),
  resumeName: z.string().max(255).default(''),
});
export function createApp({ store: providedStore = openStore(), extract = extractText, explain = matchJobs, jobProvider = createJobProvider(), googleClientId, verifyGoogle } = {}) {
  const store = new Proxy(providedStore, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof method !== 'function') return method;
      return async (...args) => {
        try { return await method.apply(target, args); }
        catch (error) {
          console.error(`[Database] ${String(property)} failed.`, error);
          throw new ApiError(503, 'Your data could not be saved or retrieved. Please retry.');
        }
      };
    },
  });
  const app = express();
  app.locals.store = store;
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const allowed = process.env.APP_ORIGINS
      ? new Set(process.env.APP_ORIGINS.split(',').map(origin => origin.trim()))
      : new Set(['http://localhost:5173', 'http://127.0.0.1:5173', `${req.protocol}://${req.get('host')}`]);
    if (req.headers.origin && !allowed.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed.' });
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Wait a minute and retry.' } }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY) }));
  const authAttempts = rateLimit({ windowMs: 60000, limit: 20, message: { error: 'Too many sign-in attempts. Wait a minute.' } });
  app.use(['/api/auth/register', '/api/auth/login'], authAttempts);
  installGoogleAuth(app, { store, authAttempts, clientId: googleClientId, verify: verifyGoogle });
  app.post('/api/auth/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Enter a name, valid email, and a password of 10–128 characters.');
    const { name, email, password, role } = parsed.data;
    if (await store.findUser(email)) throw new ApiError(409, 'An account with that email already exists.');
    const passwordHash = await hashPassword(password);
    const id = await store.createUser(email, passwordHash, name, role);
    if (id === null) throw new ApiError(409, 'An account with that email already exists.');
    await issueSession(req, res, store, id);
    res.status(201).json({ user: publicUser(await store.user(id)) });
  });
  app.post('/api/auth/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Enter a valid email and password.');
    const user = await store.findUser(parsed.data.email);
    if (!user || !await verifyPassword(parsed.data.password, user.password_hash)) throw new ApiError(401, 'Incorrect email or password.');
    await issueSession(req, res, store, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => { await clearSession(req, res, store); res.json({ ok: true }); });
  app.delete('/api/auth/account', async (req, res) => {
    const user = await store.sessionUser(sessionHash(req));
    if (!user) return res.status(401).json({ error: 'Sign in to delete your account.' });
    const parsed = z.object({ confirmation: z.literal('DELETE') }).safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Type DELETE to confirm permanent account deletion.');
    await store.deleteAccount(user.id);
    await clearSession(req, res, store);
    res.json({ ok: true });
  });
  app.get('/api/auth/me', async (req, res) => {
    const user = await store.sessionUser(sessionHash(req));
    res.json({ user: user ? publicUser(user) : null });
  });
  // All resume/profile/matching routes derive ownership from the session, not request user IDs.
  app.use('/api', async (req, res, next) => {
    req.user = await store.sessionUser(sessionHash(req));
    if (!req.user) return res.status(401).json({ error: 'Sign in to access your resume and profile.' });
    next();
  });
  app.get('/api/jobs', async (req, res) => {
    const profile = JSON.parse(req.user.profile_json);
    const skills = req.user.confirmed ? profile.skills : '';
    res.json({ jobs: skills.trim() ? await jobProvider.getJobs({ skills, refresh: req.query.refresh === 'true' }) : [] });
  });
  app.get('/api/applications', async (req, res) => res.json({ applications: await store.applications(req.user.id) }));
  app.post('/api/applications/start', async (req, res) => {
    const parsed = z.object({ jobId: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Choose a valid job.');
    const profile = JSON.parse(req.user.profile_json);
    const job = (await jobProvider.getJobs({ skills: profile.skills })).find(job => String(job.id) === parsed.data.jobId);
    if (!job) throw new ApiError(404, 'This job is no longer in the available listings.');
    const url = safeExternalUrl(job.applyUrl || job.postingUrl);
    if (!url) throw new ApiError(422, 'This job has no valid application link.');
    await store.startApplication(req.user.id, job);
    res.json({ applications: await store.applications(req.user.id), url });
  });
  app.patch('/api/applications/:jobId', async (req, res) => {
    const parsed = z.object({ status: z.enum(['Started','Applied','Interviewing','Offered','Rejected','Withdrawn']) }).safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Choose a valid application status.');
    if (!await store.updateApplication(req.user.id, req.params.jobId, parsed.data.status)) throw new ApiError(404, 'Application not found.');
    res.json({ applications: await store.applications(req.user.id) });
  });

  app.delete('/api/applications/:jobId', async (req, res) => {
    const deleted = await store.deleteApplication(
      req.user.id,
      req.params.jobId
    );

    if (!deleted) {
      throw new ApiError(404, 'Application not found.');
    }

    res.json({
      applications: await store.applications(req.user.id)
    });
  });


  app.get('/api/profile', (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/profile/confirm', async (req, res) => {
    const parsed = z.object({ confirmed: z.literal(true), profile: profileSchema }).safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.slice(1).join(' ') || 'Profile confirmation';
      throw new ApiError(400, `${field}: ${issue.message}`);
    }
    await store.saveProfile(req.user.id, parsed.data.profile);
    // Reviewed draft has been consumed. The saved confirmed fields are now authoritative.
    await store.deleteDraft(req.user.id);
    res.json({ user: publicUser(await store.user(req.user.id)) });
  });
  app.get('/api/resumes/latest', async (req, res) => res.json({ draft: await store.draft(req.user.id) }));
  app.get('/api/resumes', async (req, res) => {
    const resume = await store.resume(req.user.id);
    res.json({ resume: resume ? { name: resume.name, size: resume.buffer.length, savedAt: resume.savedAt } : null });
  });
  app.get('/api/resumes/file', async (req, res) => {
    const resume = await store.resume(req.user.id);
    if (!resume) throw new ApiError(404, 'No uploaded resume is saved to your account.');
    const extension = resume.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
    const contentType = extension === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const filename = resume.name.replace(/[\r\n"]/g, '_');
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': resume.buffer.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.send(resume.buffer);
  });
  app.delete('/api/resumes/file', async (req, res) => {
    await store.deleteResume(req.user.id);
    res.json({ resume: null, user: publicUser(await store.user(req.user.id)) });
  });
  app.get('/api/saved-jobs', async (req, res) => res.json({ savedJobs: await store.savedJobs(req.user.id) }));
  app.post('/api/saved-jobs', async (req, res) => {
    const parsed = z.object({ jobId: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'Choose a valid job.');
    const profile = JSON.parse(req.user.profile_json);
    const job = (await jobProvider.getJobs({ skills: profile.skills })).find(item => String(item.id) === parsed.data.jobId);
    if (!job) throw new ApiError(404, 'This job is no longer in the available listings.');
    await store.saveJob(req.user.id, job);
    res.json({ savedJobs: await store.savedJobs(req.user.id) });
  });
  app.delete('/api/saved-jobs/:jobId', async (req, res) => {
    await store.removeSavedJob(req.user.id, req.params.jobId);
    res.json({ savedJobs: await store.savedJobs(req.user.id) });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });
  app.post('/api/resumes/parse', upload.single('resume'), async (req, res) => {
    let rawText;
    try { rawText = await extract(req.file); }
    catch (error) { throw new ApiError(422, error.message); }
    const result = { fields: parseResumeFields(rawText), rawText, resumeName: req.file.originalname,
      warnings: ['Review all extracted fields. Skills and section headings may be missed; this parser is rule-based.'] };
    await store.saveResume(req.user.id, req.file);
    await store.saveDraft(req.user.id, result);
    res.json(result);
  });
  app.post('/api/jobs/match', async (req, res) => {
    if (!req.user.confirmed) throw new ApiError(409, 'Confirm your profile before matching jobs.');
    const request = z.object({ consent: z.literal(true) }).safeParse(req.body || {});
    if (!request.success) throw new ApiError(400, 'Consent to send your qualification fields and job descriptions to Gemini before matching.');
    const profile = JSON.parse(req.user.profile_json);
    if (!profile.skills.trim()) throw new ApiError(422, 'Add skills from your resume or profile before matching jobs.');
    const jobs = await jobProvider.getJobs({ skills: profile.skills });
    const eligible = jobs.filter(job => (profile.mode === 'Any' || !profile.mode || job.mode === profile.mode)
      && (profile.type === 'Any' || !profile.type || job.type === profile.type));
    let matches = [];
    if (eligible.length) {
      try {
        const { skills, experience, projects, education, certifications, title, location, mode, type } = profile;
        matches = (await explain({ skills, experience, projects, education, certifications, title, location, mode, type }, eligible))
          .filter(item => item.score > 0)
          .map(item => ({ ...item, aiReasons: item.reasons, reasons: item.reasons }));
      } catch (error) {
        if (error instanceof ApiError) throw error;
        console.warn('[Gemini matching] Unexpected error while matching jobs.');
        throw new ApiError(502, 'Gemini matching failed. Please retry.');
      }
    }

    res.json({ jobs, matches, source: 'gemini', sampleJobs: false,
      message: matches.length ? '' : eligible.length ? 'Gemini found no relevant matches for these listings.'
        : 'No jobs match your work arrangement and employment type preferences.' });
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

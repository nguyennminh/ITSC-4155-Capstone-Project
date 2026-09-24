import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { jobs } from '../src/data/mockData.js';
import { extractText } from './services/extractText.js';
import { parseResumeFields } from './services/resumeFields.js';
import { ApiError, matchJobs, matchRequest } from './services/aiMatcher.js';

export function createApp({ extract = extractText, match = matchJobs } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const allowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
    if (req.headers.origin && !allowed.has(req.headers.origin)) {
      return res.status(403).json({ error: 'Origin not allowed.' });
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 20,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests. Wait a minute and retry.' },
  }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY) }));
  const upload = multer({ storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  app.post('/api/resumes/parse', upload.single('resume'), async (req, res, next) => {
    try {
      const rawText = await extract(req.file);
      res.json({ fields: parseResumeFields(rawText), rawText,
        warnings: ['Automatic extraction can miss headings and skills. Compare every field with the extracted text before confirming.'] });
    } catch (error) { next(new ApiError(422, error.message)); }
  });
  app.post('/api/jobs/match', async (req, res, next) => {
    try {
      const result = matchRequest.safeParse(req.body);
      if (!result.success) throw new ApiError(400, 'Confirm your profile and provide valid qualification and preference fields.');
      const { profile } = result.data;
      if (![profile.skills, profile.experience, profile.education].some(value => value.trim())) {
        throw new ApiError(400, 'Add skills, experience, or education before matching.');
      }
      // Jobs come from our server's fixtures, never client-supplied job descriptions.
      const eligible = jobs.filter(job => (profile.mode === 'Any' || job.mode === profile.mode)
        && (profile.type === 'Any' || job.type === profile.type));
      res.json({ matches: await match(profile, eligible), source: 'ai', sampleJobs: true });
    } catch (error) { next(error); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Upload one PDF or DOCX file, 10 MB or smaller, in the resume field.' });
    }
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' });
    res.status(500).json({ error: 'Something went wrong. Please retry.' });
  });
  return app;
}

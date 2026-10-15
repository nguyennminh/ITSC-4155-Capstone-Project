import { ApiError } from './aiMatcher.js';
import { safeExternalUrl } from '../../src/services/linkService.js';
import { skillCatalog } from '../../src/data/skillCatalog.js';
export function plainText(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
export function normalizeJobs(rows, candidateSkills = []) {
  const seen = new Set();
  const searchableSkills = [...new Set([...skillCatalog, ...candidateSkills])];
  return rows.flatMap(row => {
    if (!row || row.expired === true || row.status === 'expired' || row.status === 'unavailable') return [];
    const title = plainText(row.title), company = plainText(row.company?.display_name);
    const description = plainText(row.description), postingUrl = safeExternalUrl(row.redirect_url);
    if (row.id == null || !title || !company || !description || !postingUrl) return [];
    const id = `adzuna-${row.id}`;
    const fingerprint = `${title}|${company}|${plainText(row.location?.display_name)}`.toLowerCase();
    if (seen.has(id) || seen.has(postingUrl) || seen.has(fingerprint)) return [];
    seen.add(id); seen.add(postingUrl); seen.add(fingerprint);
    const text = `${title} ${description}`;
    const jobSkills = searchableSkills.filter(skill => {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(text);
    });
    return [{ id, title, company, description, postingUrl, applyUrl: postingUrl, source: 'Adzuna',
      descriptionIsSnippet: true, location: plainText(row.location?.display_name) || 'Not provided',
      mode: 'Unknown', type: row.contract_time === 'full_time' ? 'Full-time' : row.contract_time === 'part_time' ? 'Part-time' : row.contract_type === 'contract' ? 'Contract' : 'Unknown',
      salary: Number.isFinite(row.salary_min) ? `$${row.salary_min.toLocaleString('en-US')}${Number.isFinite(row.salary_max) ? '–$'+row.salary_max.toLocaleString('en-US') : '+'}${row.salary_is_predicted == 1 ? ' (estimated)' : ''}` : '',
      skills: jobSkills, created: row.created || '', available: true }];
  });
}
export function createJobProvider({ fetchImpl = fetch, appId = process.env.ADZUNA_APP_ID, appKey = process.env.ADZUNA_APP_KEY, now = Date.now } = {}) {
  let cached = null;
  const pending = new Map();
  async function load(what, candidateSkills) {
    const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1');
    url.search = new URLSearchParams({ app_id: appId, app_key: appKey, results_per_page: '20', what_or: what, ...(process.env.JOBS_LOCATION ? { where: process.env.JOBS_LOCATION } : {}) }).toString();
    let response;
    try { response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) }); }
    catch { throw new ApiError(502, 'Job provider could not connect. Retry later.'); }
    if (!response.ok) throw new ApiError(502, response.status === 429 ? 'Job provider rate limit reached. Retry later.' : 'Job provider rejected the request. Check provider credentials.');
    let data;
    try { data = await response.json(); } catch { throw new ApiError(502, 'Job provider returned invalid JSON.'); }
    if (!Array.isArray(data.results)) throw new ApiError(502, 'Job provider returned an unexpected response.');
    return normalizeJobs(data.results.slice(0,20), candidateSkills);
  }
  return { async getJobs({ skills = '' } = {}) {
    if (!appId || !appKey) throw new ApiError(503, 'Add ADZUNA_APP_ID and ADZUNA_APP_KEY to the server .env and restart.');
    const candidateSkills = [...new Set(String(skills).split(/[,;\n|]+/)
      .map(skill => skill.trim().slice(0, 80)).filter(Boolean))];
    if (!candidateSkills.length) throw new ApiError(422, 'Add skills from your resume or profile before searching for jobs.');
    const what = candidateSkills.join(' ');
    const cacheKey = `${what}\n${process.env.JOBS_LOCATION || ''}`;
    if (cached?.key === cacheKey && now() - cached.fetchedAt < 600000) return structuredClone(cached.jobs);
    if (!pending.has(cacheKey)) {
      const request = load(what, candidateSkills).then(jobs => {
        cached = { key: cacheKey, jobs, fetchedAt: now() };
        return jobs;
      }).finally(() => pending.delete(cacheKey));
      pending.set(cacheKey, request);
    }
    return structuredClone(await pending.get(cacheKey));
  } };
}

import { ApiError } from './aiMatcher.js';
import { createJobProvider, extractJobSkills, plainText } from './jobProvider.js';
import { canonicalSkill } from './matching.js';
import { skillCatalog } from '../../src/data/skillCatalog.js';
import { pageKind } from '../../extension/settings.js';

export const defaultBoards = 'discord,cloudflare,figma,robinhood';
const cacheDuration = 10 * 60 * 1000;
const entities = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', nbsp: ' ' };

function text(value) {
  const decoded = String(value ?? '').replace(/&(#x[\da-f]+|#\d+|lt|gt|quot|apos|amp|nbsp);/gi, (entity, code) => {
    if (code[0] !== '#') return entities[code.toLowerCase()];
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : entity;
  });
  return plainText(decoded.replace(/<\/?(?:p|br|div|li|h[1-6])\b[^>]*>/gi, ' '));
}

function normalize(row, board) {
  if (!Number.isSafeInteger(row?.id) || row.id < 1 || pageKind(row.absolute_url) !== 'application') return null;
  const title = text(row.title);
  if (!title) return null;
  const rawDescription = text(row.content);
  const description = rawDescription.slice(0, 16_000);
  const location = text(row.location?.name);
  const postingUrl = new URL(row.absolute_url);
  const applyUrl = new URL(postingUrl);
  applyUrl.hash = 'application-form';
  const typeField = Array.isArray(row.metadata) ? row.metadata.find(item =>
    /^(employment type|job type)$/i.test(item?.name)) : null;
  const typeKey = String(typeField?.value ?? '').toLowerCase().trim().replace(/[_\s-]+/g, ' ');
  const types = new Map([['full time', 'Full-time'], ['part time', 'Part-time'], ['internship', 'Internship'], ['contract', 'Contract']]);
  return {
    id: `greenhouse-${board}-${row.id}`, title, company: text(row.company_name) || board,
    description, descriptionIsSnippet: rawDescription.length > description.length,
    location: location || 'Not provided', mode: /^remote\b/i.test(location) ? 'Remote' : /^hybrid\b/i.test(location) ? 'Hybrid' : 'Unknown',
    type: types.get(typeKey) || (/\b(?:intern|internship)\b/i.test(title) ? 'Internship' : 'Unknown'),
    postingUrl: postingUrl.href, applyUrl: applyUrl.href, source: 'Greenhouse',
    created: row.first_published || row.updated_at || '', available: true,
    skills: extractJobSkills(`${title}\n${description}`, skillCatalog),
  };
}

export function createGreenhouseProvider({ boards = process.env.GREENHOUSE_BOARDS || defaultBoards, fetchImpl = fetch, now = Date.now } = {}) {
  const tokens = [...new Set(boards.split(',').map(board => board.trim().toLowerCase()).filter(Boolean))];
  const cached = new Map(), pending = new Map();
  const catalog = new Set(skillCatalog.map(canonicalSkill));
  async function loadBoard(board, refresh) {
    const entry = cached.get(board);
    if (!refresh && entry && now() - entry.time < cacheDuration) return entry.jobs;
    if (!pending.has(board)) {
      const request = (async () => {
        const response = await fetchImpl(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, {
          redirect: 'error', signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Greenhouse returned HTTP ${response.status}`);
        const body = await response.json();
        if (!Array.isArray(body?.jobs)) throw new Error('Greenhouse returned an unexpected response.');
        const jobs = body.jobs.map(row => normalize(row, board)).filter(Boolean);
        cached.set(board, { time: now(), jobs });
        return jobs;
      })().finally(() => pending.delete(board));
      pending.set(board, request);
    }
    return pending.get(board);
  }
  async function listings(refresh = false) {
    if (!tokens.length || tokens.length > 8 || tokens.some(board => !/^[a-z0-9_-]{1,80}$/.test(board))) {
      throw new ApiError(503, 'Set GREENHOUSE_BOARDS to 1–8 comma-separated employer board names.');
    }
    const results = await Promise.allSettled(tokens.map(board => loadBoard(board, refresh)));
    const available = results.filter(result => result.status === 'fulfilled');
    if (!available.length) throw new ApiError(502, 'Could not load the configured Greenhouse boards. Retry later.');
    return available.flatMap(result => result.value);
  }
  return {
    source: 'Greenhouse',
    async getJob(id) { return (await listings()).find(job => job.id === id); },
    async getJobs({ skills = '', title = '', refresh = false } = {}) {
      const terms = [...new Set(skills.split(/[,;\n|]+/).map(skill => skill.trim().slice(0, 80)).filter(Boolean))].slice(0, 80);
      const wanted = new Set(terms.map(canonicalSkill));
      const extra = terms.filter(skill => !catalog.has(canonicalSkill(skill)));
      const preferred = title.trim().toLowerCase();
      const seen = new Set();
      const candidates = [];
      for (const job of await listings(refresh)) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        const tags = [...job.skills, ...extractJobSkills(`${job.title}\n${job.description}`, extra)];
        const overlap = new Set(tags.map(canonicalSkill).filter(skill => wanted.has(skill))).size;
        const role = preferred && job.title.toLowerCase().includes(preferred);
        if (overlap || role) candidates.push({ job: { ...job, skills: tags }, priority: overlap + (role ? 2 : 0) });
      }
      candidates.sort((a, b) => b.priority - a.priority || (Date.parse(b.job.created) || 0) - (Date.parse(a.job.created) || 0)
        || a.job.id.localeCompare(b.job.id));
      const groups = new Map();
      for (const { job } of candidates) {
        const company = job.company.toLowerCase();
        if (!groups.has(company)) groups.set(company, []);
        groups.get(company).push(job);
      }
      const jobs = [];
      for (let index = 0; jobs.length < 40; index++) {
        const before = jobs.length;
        for (const group of groups.values()) {
          if (group[index]) jobs.push(group[index]);
          if (jobs.length === 40) break;
        }
        if (before === jobs.length) break;
      }
      return jobs;
    },
  };
}

export function configuredJobProvider(source = process.env.JOB_PROVIDER || 'greenhouse') {
  if (source === 'greenhouse') return createGreenhouseProvider();
  if (source === 'adzuna') return createJobProvider();
  throw new Error('JOB_PROVIDER must be greenhouse or adzuna.');
}

// Deterministic keyword fallback when the local embedding runtime is unavailable.
// Keep this formula aligned with the explanation shown in Discover:
// 90 points for skill coverage + 5 for title + 5 for location.

const skillAliases = {
  javascript: ['javascript', 'js', 'ecmascript'],
  typescript: ['typescript', 'ts'],
  react: ['react', 'react.js', 'reactjs'],
  'node.js': ['node.js', 'nodejs', 'node js'],
  postgresql: ['postgresql', 'postgres'],
  'c#': ['c#', 'c sharp', 'csharp'],
  'c++': ['c++', 'cpp'],
  'power bi': ['power bi', 'powerbi'],
  'amazon web services': ['amazon web services', 'aws'],
};

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function semanticSimilarity(left, right) {
  const terms = value => new Set(normalize(value).match(/[a-z0-9+#.]{2,}/g) || []);
  const a = terms(left); const b = terms(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap++;
  return overlap / Math.sqrt(a.size * b.size);
}

// Supports both today's text fields and future arrays of experience/project entries.
// Read only qualification-related properties, rather than coercing objects to [object Object].
export function qualificationText(value, depth = 0) {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => qualificationText(item, depth + 1)).join('\n');
  if (typeof value !== 'object') return '';
  const fields = ['name', 'title', 'role', 'company', 'employer', 'organization',
    'degree', 'institution', 'school', 'description', 'summary', 'bullets',
    'responsibilities', 'achievements', 'technologies', 'skills'];
  return fields.map(field => qualificationText(value[field], depth + 1)).filter(Boolean).join('\n');
}
function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Avoid Java matching JavaScript, C matching C++, and SQL matching MySQL.
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(text);
}

// Quote source passages rather than inferring proficiency from a skill mention.
export function buildMatchEvidence(profile, job, matched) {
  const sections = [['experience', 'Experience'], ['projects', 'Projects'], ['certifications', 'Certifications'],
    ['education', 'Education'], ['skills', 'Skills']];
  function excerpt(text, aliases) {
    const passage = qualificationText(text).split(/\n+|(?<=[.!?])\s+/)
      .map(value => value.trim()).find(value => aliases.some(alias => hasTerm(normalize(value), alias)));
    if (!passage) return '';
    const index = Math.max(0, aliases.map(alias => normalize(passage).indexOf(alias)).filter(i => i >= 0).sort((a, b) => a - b)[0] || 0);
    const start = Math.max(0, index - 100);
    return `${start ? '…' : ''}${passage.slice(start, start + 300)}${passage.length > start + 300 ? '…' : ''}`;
  }
  return matched.slice(0, 6).map(skill => {
    const aliases = skillAliases[skill] || [skill];
    const source = sections.find(([field]) => excerpt(profile[field], aliases));
    return { skill, profileSource: source?.[1] || 'Qualifications',
      profileExcerpt: source ? excerpt(profile[source[0]], aliases) : '',
      jobExcerpt: excerpt(job.description, aliases) || excerpt(job.title, aliases) };
  });
}

function canonicalSkill(skill) {
  const normalized = normalize(skill);
  return Object.keys(skillAliases).find(key => skillAliases[key].includes(normalized)) || normalized;
}

function preference(value) {
  return normalize(value).replace(/[\s_-]/g, '');
}

function acceptsPreference(wanted, actual) {
  const requested = preference(wanted);
  return !requested || requested === 'any' || requested === preference(actual);
}

function validId(id) {
  return (typeof id === 'string' && id.trim().length > 0)
    || (typeof id === 'number' && Number.isSafeInteger(id));
}

export function rankJobs(profile = {}, jobs = []) {
  if (!profile || typeof profile !== 'object' || !Array.isArray(jobs)) return [];

  const qualifications = normalize([
    profile.skills, profile.experience, profile.projects, profile.education, profile.certifications,
  ].map(value => qualificationText(value)).join('\n'));
  const title = normalize(profile.title);
  const location = normalize(profile.location);
  const results = [];
  const seenIds = new Set();

  for (const job of jobs) {
    if (!job || !validId(job.id)) continue;
    const idKey = String(job.id);
    if (seenIds.has(idKey)) continue;
    seenIds.add(idKey);
    if (job.available === false || job.expired === true) continue;
    if (!( !job.mode || preference(job.mode) === 'unknown' || acceptsPreference(profile.mode, job.mode)) || !acceptsPreference(profile.type, job.type)) continue;

    const skills = Array.isArray(job.skills) ? job.skills : [];
    const required = [...new Set(skills.filter(skill => typeof skill === 'string')
      .map(canonicalSkill).filter(Boolean))];
    const matched = required.filter(skill => (skillAliases[skill] || [skill])
      .some(alias => hasTerm(qualifications, alias)));

    // A title/location coincidence alone is not evidence of a qualification match.
    if (!matched.length) continue;
    const missing = required.filter(skill => !matched.includes(skill));
    const titleMatch = Boolean(title && hasTerm(normalize(job.title), title));
    const locationMatch = Boolean(location && hasTerm(normalize(job.location), location));
    const semanticScore = semanticSimilarity(qualifications, [job.title, job.description, ...(job.skills || [])].join('\n'));
    const keywordScore = 90 * matched.length / required.length + (titleMatch ? 5 : 0) + (locationMatch ? 5 : 0);
    const score = Math.min(100, Math.round(keywordScore));

    results.push({
      jobId: job.id, // Preserve the original type for existing numeric fixtures and string provider IDs.
      score,
      semanticScore: Math.round(semanticScore * 100) / 100,
      coverage: matched.length / required.length,
      warnings: !job.mode || preference(job.mode) === 'unknown' ? ['Work arrangement is unknown. Verify it in the original posting.'] : [],
      evidence: buildMatchEvidence(profile, job, matched),
      matched,
      missing,
      reasons: [
        `Your confirmed qualifications mention: ${matched.join(', ')}.`,
        ...(titleMatch ? ['The title matches your preferred role.'] : []),
        ...(locationMatch ? ['The location matches your preference.'] : []),
      ],
    });
  }

  // Stable ordering makes tied results repeatable across refreshes/tests.
  return results.sort((a, b) => b.score - a.score || b.semanticScore - a.semanticScore || String(a.jobId).localeCompare(String(b.jobId)));
}

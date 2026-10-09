// Keyword matching is the default and the fallback when Gemini is unavailable.
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
    if (!acceptsPreference(profile.mode, job.mode) || !acceptsPreference(profile.type, job.type)) continue;

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
    const score = Math.round(90 * matched.length / required.length
      + (titleMatch ? 5 : 0) + (locationMatch ? 5 : 0));

    results.push({
      jobId: job.id, // Preserve the original type for existing numeric fixtures and string provider IDs.
      score,
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
  return results.sort((a, b) => b.score - a.score || String(a.jobId).localeCompare(String(b.jobId)));
}

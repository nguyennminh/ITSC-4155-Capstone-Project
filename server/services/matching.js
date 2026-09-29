// Deterministic first-version scoring allowed by PBI #14. Gemini never controls scores.
const aliases = { js: 'javascript', ts: 'typescript', 'react.js': 'react', reactjs: 'react', nodejs: 'node.js', postgres: 'postgresql' };
function normalize(value) { return String(value || '').trim().toLowerCase(); }
function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(text);
}
export function rankJobs(profile, jobs) {
  const qualifications = [profile.skills, profile.experience, profile.education, profile.certifications]
    .map(value => value || '').join('\n');
  const title = normalize(profile.title);
  const location = normalize(profile.location);
  const results = [];
  for (const job of jobs) {
    if (profile.mode && profile.mode !== 'Any' && job.mode !== profile.mode) continue;
    if (profile.type && profile.type !== 'Any' && job.type !== profile.type) continue;
    const required = [...new Set((job.skills || []).map(normalize).filter(Boolean))];
    const matched = required.filter(skill => hasTerm(qualifications, skill)
      || Object.entries(aliases).some(([alias, canonical]) => canonical === skill && hasTerm(qualifications, alias)));
    if (!matched.length) continue;
    const titleMatch = Boolean(title && normalize(job.title).includes(title));
    const locationMatch = Boolean(location && normalize(job.location).includes(location));
    const score = Math.round(90 * matched.length / required.length + (titleMatch ? 5 : 0) + (locationMatch ? 5 : 0));
    results.push({ jobId: job.id, score, matched,
      reasons: [`Your confirmed qualifications mention: ${matched.join(', ')}.`,
        ...(titleMatch ? ['The title matches your preferred role.'] : []),
        ...(locationMatch ? ['The location matches your preference.'] : [])],
      missing: required.filter(skill => !matched.includes(skill)),
    });
  }
  return results.sort((a, b) => b.score - a.score || String(a.jobId).localeCompare(String(b.jobId)));
}

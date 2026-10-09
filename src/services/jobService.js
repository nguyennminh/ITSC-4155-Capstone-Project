import { jobs } from '../data/mockData.js';

// This is the integration boundary. Later, replace with fetch('/api/jobs').
// Do not put private API keys in frontend JavaScript.
export async function getJobs() {
  return jobs.map(job => ({ ...job }));
}

export function matchSkills(job, skillsText) {
  const skills = skillsText.split(',').map(skill => skill.trim().toLowerCase()).filter(Boolean);
  const matched = job.skills.filter(skill => skills.includes(skill.toLowerCase()));
  return { matched, score: Math.round(matched.length / job.skills.length * 100) };
}

export function filterJobs(jobs, query, mode, type) {
  const search = query.trim().toLowerCase();
  return jobs.filter(job =>
    (job.title + ' ' + job.company + ' ' + job.location).toLowerCase().includes(search)
    && (mode === 'Any' || job.mode === mode)
    && (type === 'Any' || job.type === type));
}

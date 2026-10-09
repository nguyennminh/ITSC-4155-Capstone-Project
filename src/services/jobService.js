import { api } from './resumeService.js';
export async function getJobs() { return (await api('/api/jobs')).jobs; }

export function matchSkills(job, skillsText) {
  const skills = String(skillsText || '').split(',').map(skill => skill.trim().toLowerCase()).filter(Boolean);
  const matched = (job.skills || []).filter(skill => skills.includes(skill.toLowerCase()));
  return { matched, score: job.skills?.length ? Math.round(matched.length / job.skills.length * 100) : 0 };
}

export function filterJobs(jobs, query, mode, type) {
  const search = query.trim().toLowerCase();
  return jobs.filter(job =>
    (job.title + ' ' + job.company + ' ' + job.location).toLowerCase().includes(search)
    && (mode === 'Any' || job.mode === mode)
    && (type === 'Any' || job.type === type));
}

import { api } from './resumeService.js';

export const getSavedJobs = () => api('/api/saved-jobs');
export const saveJob = jobId => api('/api/saved-jobs', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: String(jobId) }),
});
export const removeSavedJob = jobId => api(`/api/saved-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });

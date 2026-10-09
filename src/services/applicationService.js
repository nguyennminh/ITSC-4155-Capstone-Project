import { api, jsonPost } from './resumeService.js';
export const getApplications = () => api('/api/applications');
export const startApplication = jobId => jsonPost('/api/applications/start', { jobId: String(jobId) });
export const changeApplicationStatus = (jobId, status) => api(`/api/applications/${encodeURIComponent(jobId)}`, {
  method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ status })
});

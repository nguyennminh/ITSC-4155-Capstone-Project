import { api, jsonPost } from './resumeService.js';
export const getApplications = () => api('/api/applications');
export const startApplication = jobId => jsonPost('/api/applications/start', { jobId: String(jobId) });
export const changeApplicationStatus = (jobId, status) => api(`/api/applications/${encodeURIComponent(jobId)}`, {
  method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ status })
});
export const deleteApplication = jobId =>
  api(`/api/applications/${encodeURIComponent(jobId)}`, {
    method: 'DELETE'
  });


export const setApplicationSharing = (jobId, shared, markApplied = false) => api(`/api/applications/${encodeURIComponent(jobId)}/sharing`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shared, markApplied }),
});

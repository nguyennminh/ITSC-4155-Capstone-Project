import { api } from './resumeService.js';

export const getRecruiterApplications = () => api('/api/recruiter/applications');
export const updateRecruiterApplication = (applicantId, jobId, status) =>
  api(`/api/recruiter/applications/${encodeURIComponent(applicantId)}/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

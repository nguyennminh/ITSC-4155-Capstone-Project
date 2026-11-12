import { api } from './resumeService.js';

const companyQuery = company => company ? `?company=${encodeURIComponent(company)}` : '';
export const getRecruiterApplications = company => api(`/api/recruiter/applications${companyQuery(company)}`);
export const recruiterResumeUrl = (applicantId, jobId, company) =>
  `/api/recruiter/applications/${encodeURIComponent(applicantId)}/${encodeURIComponent(jobId)}/resume${companyQuery(company)}`;
export const updateRecruiterApplication = (applicantId, jobId, status, company) =>
  api(`/api/recruiter/applications/${encodeURIComponent(applicantId)}/${encodeURIComponent(jobId)}${companyQuery(company)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

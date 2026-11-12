import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { getRecruiterApplications, recruiterResumeUrl, updateRecruiterApplication } from '../services/recruiterService.js';

const statuses = ['Reviewing', 'Interviewing', 'Offered', 'Rejected'];

export default function Recruiter() {
  const [applications, setApplications] = useState([]);
  const [company, setCompany] = useState('');
  const [companies, setCompanies] = useState([]);
  const [selection, setSelection] = useState('');
  const [jobId, setJobId] = useState('');
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setApplications([]);
    getRecruiterApplications(selection)
      .then(result => { if (active) { setCompany(result.company); setCompanies(result.companies || []); setApplications(result.applications); } })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection]);

  const roles = useMemo(() => [...new Map(applications.map(application => [application.id, application])).values()]
    .sort((a, b) => a.title.localeCompare(b.title)), [applications]);
  const statusesInUse = [...new Set(applications.map(application => application.status))];
  const visible = applications.filter(application => (!jobId || application.id === jobId) && (filter === 'All' || application.status === filter));
  async function changeStatus(application, status) {
    const key = `${application.applicantId}:${application.id}`;
    setBusy(key); setError('');
    try {
      const result = await updateRecruiterApplication(application.applicantId, application.id, status, company);
      setApplications(result.applications);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  return <section className="recruiter-page">
    <PageHeader title="Applicant dashboard" subtitle={company ? `Applications for ${company}` : 'Review applications shared with your company'} />
    {error && <p className="profile-error" role="alert">{error}</p>}
    {companies.length > 1 && <label>Company
      <select value={selection || company} disabled={loading || Boolean(busy)} onChange={event => {
        setJobId(''); setFilter('All'); setSelection(event.target.value);
      }}>
        {companies.map(name => <option key={name}>{name}</option>)}
      </select>
    </label>}
    {company && <div className="card">
      <label>Job opening
        <select value={jobId} onChange={event => { setJobId(event.target.value); setFilter('All'); }}>
          <option value="">All openings</option>
          {roles.map(job => <option key={job.id} value={job.id}>{job.title}{job.location ? ` · ${job.location}` : ''} (#{job.id})</option>)}
        </select>
      </label>
      <p>{visible.length} {visible.length === 1 ? 'application' : 'applications'}</p>
    <label className="status-filter">Filter applications
      <select value={filter} onChange={event => setFilter(event.target.value)}>
        <option>All</option>{statusesInUse.map(status => <option key={status}>{status}</option>)}
      </select>
    </label></div>}
    {loading && <p role="status">Loading applications…</p>}
    {!loading && !error && !visible.length && <p className="card">{applications.length ? "No applications match this filter." : "No applicants have shared an application with your company yet."}</p>}
    {!loading && visible.map(application => {
      const key = `${application.applicantId}:${application.id}`;
      return <article className="card applicant-card" key={key}>
        <div className="row"><div><h2>{application.applicant?.name || 'Applicant'}</h2><p>{application.title} · {application.company}</p></div><span className="badge">{application.status}</span></div>
        <p>{application.applicant?.email}{application.applicant?.phone && ` · ${application.applicant.phone}`}</p>
        <p><strong>Skills:</strong> {application.applicant?.skills || 'Not provided'}</p>
        <p><strong>Education:</strong> {application.applicant?.education || 'Not provided'}</p>
        <p><strong>Experience:</strong> {application.applicant?.experience || 'Not provided'}</p>
        {application.applicant?.resumeName && <p>Resume: <a href={recruiterResumeUrl(application.applicantId, application.id, company)} target="_blank" rel="noopener noreferrer">Download {application.applicant.resumeName}</a></p>}
        <label>Update status
          <select disabled={busy === key} value={application.status} onChange={event => changeStatus(application, event.target.value)}>
            {!statuses.includes(application.status) && <option disabled>{application.status}</option>}
            {statuses.map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
      </article>;
    })}
  </section>;
}

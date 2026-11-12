import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { getRecruiterApplications, updateRecruiterApplication } from '../services/recruiterService.js';

const statuses = ['Started', 'New', 'Reviewing', 'Interviewing', 'Offered', 'Rejected'];

export default function Recruiter({ profile }) {
  const [applications, setApplications] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getRecruiterApplications()
      .then(result => { if (active) setApplications(result.applications); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile.companyName]);

  const visible = useMemo(() => applications.filter(application => filter === 'All' || application.status === filter), [applications, filter]);
  async function changeStatus(application, status) {
    const key = `${application.applicantId}:${application.id}`;
    setBusy(key); setError('');
    try {
      const result = await updateRecruiterApplication(application.applicantId, application.id, status);
      setApplications(result.applications);
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  return <section className="recruiter-page">
    <PageHeader title="Applicant dashboard" subtitle={profile.companyName ? `Applications for ${profile.companyName}` : 'Add your company name to view applications.'} />
    {!profile.companyName && <p className="notice">Complete your recruiter profile before reviewing company applications.</p>}
    {error && <p className="profile-error" role="alert">{error}</p>}
    <label className="status-filter">Filter applications
      <select value={filter} onChange={event => setFilter(event.target.value)}>
        <option>All</option>{statuses.map(status => <option key={status}>{status}</option>)}
      </select>
    </label>
    {loading && <p role="status">Loading applications…</p>}
    {!loading && !visible.length && <p className="card">No applications match this filter.</p>}
    {!loading && visible.map(application => {
      const key = `${application.applicantId}:${application.id}`;
      return <article className="card applicant-card" key={key}>
        <div className="row"><div><h2>{application.applicant?.name || 'Applicant'}</h2><p>{application.title} · {application.company}</p></div><span className="badge">{application.status}</span></div>
        <p>{application.applicant?.email}{application.applicant?.phone && ` · ${application.applicant.phone}`}</p>
        <p><strong>Skills:</strong> {application.applicant?.skills || 'Not provided'}</p>
        <p><strong>Education:</strong> {application.applicant?.education || 'Not provided'}</p>
        <p><strong>Experience:</strong> {application.applicant?.experience || 'Not provided'}</p>
        {application.applicant?.resumeName && <p>Resume: <a href={`/api/recruiter/applications/${encodeURIComponent(application.applicantId)}/${encodeURIComponent(application.id)}/resume`} target="_blank" rel="noopener noreferrer">{application.applicant.resumeName}</a></p>}
        <label>Update status
          <select disabled={busy === key} value={application.status} onChange={event => changeStatus(application, event.target.value)}>
            {statuses.map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
      </article>;
    })}
  </section>;
}

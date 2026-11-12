
import React from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { safeExternalUrl } from '../services/linkService.js';

export default function Applications({ applications, updateStatus, deleteApplication, shareApplication }) {
  const handleDelete = async (jobId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this application?'
    );

    if (!confirmed) return;

    try {
      await deleteApplication(jobId);
    } catch (error) {
      window.alert('Could not delete application. Please try again.');
    }
  };

  return (
    <section>
      <PageHeader title="Your applications" subtitle="Track every opportunity in one place"/>
      <p>
        Track your progress manually. Opening an external page
        does not mean you applied.
      </p>

      {!applications.length && (
        <p className="card">
          No applications tracked yet. Start from a job card.
        </p>
      )}

      {applications.map(application => (
        <article className="card" key={application.id}>
          <h2>{application.title}</h2>
          <p>{application.company}</p>

          {safeExternalUrl(application.applyUrl) && (
            <a
              href={safeExternalUrl(application.applyUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Continue on external website ↗
            </a>
          )}

          <label>
            Status
            <select
              value={application.status}
              onChange={event =>
                updateStatus(application.id, event.target.value)
              }
            >
              {[
                'Started',
                'Applied',
                ...(application.status === 'Reviewing' ? ['Reviewing'] : []),
                'Interviewing',
                'Offered',
                'Rejected',
                'Withdrawn'
              ].map(status => (
                <option key={status} disabled={status === 'Reviewing'}>{status}</option>
              ))}
            </select>
          </label>

          {application.company && application.status !== 'Withdrawn' && (
            <div>
              <p>{application.shared
                ? 'Shared with authorized recruiters for this company.'
                : 'After you apply, sharing lets authorized recruiters for this company see your application, contact details, profile and current saved résumé.'}</p>
              <button type="button" onClick={() => shareApplication(application.id, !application.shared, application.status === 'Started')}>
                {application.shared ? 'Stop sharing' : application.status === 'Started' ? 'Mark applied & share' : 'Share with company'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleDelete(application.id)}
            style={{
              marginTop: '12px',
              padding: '8px 14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Delete Application
          </button>
        </article>
      ))}
    </section>
  );
}

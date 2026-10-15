
import React from 'react';
import { safeExternalUrl } from '../services/linkService.js';

export default function Applications({ applications, updateStatus, deleteApplication }) {
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
      <h1>Applications</h1>
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
                'Interviewing',
                'Offered',
                'Rejected',
                'Withdrawn'
              ].map(status => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>

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

import React from 'react';

export default function Applications({ applications, updateStatus }) {
  return <section><h1>Applications</h1><p>Track your progress manually. Opening an external page does not mean you applied.</p>
    {!applications.length && <p className="card">No applications tracked yet. Start from a job card.</p>}
    {applications.map(application => <article className="card" key={application.id}><h2>{application.title}</h2><p>{application.company}</p>
      <label>Status<select value={application.status} onChange={event => updateStatus(application.id, event.target.value)}>
        {['Started','Applied','Interviewing','Offered','Rejected','Withdrawn'].map(x => <option key={x}>{x}</option>)}
      </select></label>
    </article>)}
  </section>;
}


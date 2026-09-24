import React from 'react';
import { matchSkills } from '../services/jobService.js';

export default function JobCard({ job, skills, aiMatch, children }) {
  const match = matchSkills(job, skills);
  return <article className="card job-card">
    <div className="row"><span className="badge">Sample listing</span>
      <span>{aiMatch ? `${aiMatch.score}/100 AI fit estimate` : `${match.score}% skill overlap`}</span>
    </div>
    <h2>{job.title}</h2><p><strong>{job.company}</strong> · {job.location}</p>
    <div className="tags"><span>{job.mode}</span><span>{job.type}</span><span>{job.salary}</span></div>
    <p>{job.description}</p>
    <h3>Skills</h3><div className="tags">{job.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
    {aiMatch ? <>
      <h3>Why this job may fit</h3>
      <ul>{aiMatch.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      <h3>Requirements not evidenced in your profile</h3>
      {aiMatch.missing.length ? <ul>{aiMatch.missing.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No gaps identified in the supplied listing.</p>}
      <small>AI can be wrong. Check the explanation against your resume and the listing. This score is not a hiring probability.</small>
    </> : <>
      <p className="muted">{match.matched.length ? 'Your matching skills: ' + match.matched.join(', ') : 'Add matching skills in your profile.'}</p>
      <small>This is a keyword comparison, not an AI score or hiring probability.</small>
    </>}
    <div className="actions">{children}</div>
  </article>;
}

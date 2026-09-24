import React from 'react';
import { matchSkills } from '../services/jobService.js';

export default function JobCard({ job, skills, children }) {
  const match = matchSkills(job, skills);
  return <article className="card job-card">
    <div className="row"><span className="badge">Sample listing</span><span>{match.score}% skill overlap</span></div>
    <h2>{job.title}</h2><p><strong>{job.company}</strong> · {job.location}</p>
    <div className="tags"><span>{job.mode}</span><span>{job.type}</span><span>{job.salary}</span></div>
    <p>{job.description}</p>
    <h3>Skills</h3><div className="tags">{job.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
    <p className="muted">{match.matched.length ? 'Your matching skills: ' + match.matched.join(', ') : 'Add matching skills in your profile.'}</p>
    <small>This is a simple keyword comparison, not an AI score or hiring probability.</small>
    <div className="actions">{children}</div>
  </article>;
}
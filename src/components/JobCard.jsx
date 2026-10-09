import React from 'react';
import { matchSkills } from '../services/jobService.js';

export default function JobCard({ job, skills, recommendation, children }) {
  const overlap = matchSkills(job, skills);
  return <article className="card job-card">
    <div className="row"><span className="badge">Sample listing</span><span>{recommendation ? `${recommendation.score}/100 match score` : `${overlap.score}% skill overlap`}</span></div>
    <h2>{job.title}</h2><p><strong>{job.company}</strong> · {job.location}</p>
    <div className="tags"><span>{job.mode}</span><span>{job.type}</span><span>{job.salary}</span></div>
    <p>{job.description}</p><h3>Skills</h3>
    <div className="tags">{job.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
    {recommendation ? <>
      <h3>Why this job matches</h3>
      <ul>{recommendation.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      <h3>Requirements not evidenced in your profile</h3>
      {recommendation.missing.length ? <ul>{recommendation.missing.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p>All listed skills were found.</p>}
      {recommendation.aiReasons?.length > 0 && <><h3>Optional Gemini explanation</h3><ul>{recommendation.aiReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul><small>AI explanations can be wrong; verify against the listing.</small></>}
    </> : <p className="muted">{overlap.matched.length ? 'Matching profile skills: ' + overlap.matched.join(', ') : 'No matching profile skills.'}</p>}
    <small>Scores help compare qualifications; they are not hiring probabilities.</small>
    <div className="actions">{children}</div>
  </article>;
}

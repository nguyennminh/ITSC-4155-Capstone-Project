import React from 'react';
import MatchExplanation from './MatchExplanation.jsx';
import { safeExternalUrl } from '../services/linkService.js';
export default function JobCard({ job, recommendation, source, onDetails, children }) {
  const url = safeExternalUrl(job.postingUrl);
  return <article className="card job-card">
    <span className="badge">{job.source || 'Sample listing'}</span>
    <h2>{job.title}</h2><p><strong>{job.company}</strong> · {job.location}</p>
    <div className="tags"><span>{job.mode}</span><span>{job.type}</span><span>{job.salary || 'Salary not provided'}</span></div>
    <p>{job.description}</p>
    {url && <a href={url} target="_blank" rel="noopener noreferrer">Original posting · {job.source} ↗</a>}
    <MatchExplanation recommendation={recommendation} source={source}/>
    <div className="actions">{onDetails && <button onClick={() => onDetails(job, recommendation)}>View details</button>}{children}</div>
  </article>;
}

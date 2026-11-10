import React from 'react';
import { ArrowUpRight, BriefcaseBusiness, House, MapPin, Sparkles } from 'lucide-react';
import { safeExternalUrl } from '../services/linkService.js';

export default function JobCard({ job, recommendation, onDetails, children }) {
  const url = safeExternalUrl(job.postingUrl);
  const company = job.company?.trim() || 'Company not provided';
  const initial = job.company?.trim().slice(0, 1).toUpperCase() || '?';
  const score = recommendation?.score;
  const skills = [...new Set(job.skills || [])].slice(0, 4);
  return <article className="card job-card">
    <div className="job-card-topline">
      <span className="company-initial" aria-hidden="true">{initial}</span>
      {Number.isFinite(score) && <span className="job-fit-pill"><Sparkles size={14} aria-hidden="true"/>{score}/100 fit estimate</span>}
    </div>
    <div className="job-card-heading"><h2>{job.title}</h2><p>{company}</p></div>
    <div className="job-card-meta">
      <span><MapPin size={16} aria-hidden="true"/>{job.location || 'Location not provided'}</span>
      <span><House size={16} aria-hidden="true"/>{job.mode || 'Arrangement not provided'}</span>
      {job.type && <span><BriefcaseBusiness size={16} aria-hidden="true"/>{job.type}</span>}
    </div>
    <div className="job-card-salary">{job.salary || 'Salary not provided'}</div>
    {job.descriptionIsSnippet && <small className="job-excerpt-label">Description excerpt</small>}
    <p className="job-card-description">{job.description || 'Open the original posting for job details.'}</p>
    {skills.length > 0 && <div className="tags job-card-skills">{skills.map(skill => <span key={skill}>{skill}</span>)}</div>}
    <div className="job-card-footer">
      {url ? <a href={url} target="_blank" rel="noopener noreferrer">Original posting · {job.source || 'Job listing'}<ArrowUpRight size={14} aria-hidden="true"/></a> : <span className="muted">{job.source || 'Sample listing'}</span>}
      {onDetails && <button type="button" onClick={() => onDetails(job, recommendation)}>View details <span aria-hidden="true">→</span></button>}
    </div>
    {children && <div className="actions job-card-actions">{children}</div>}
  </article>;
}

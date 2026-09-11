import React, { useState } from 'react';
import JobCard from '../components/JobCard.jsx';
import { filterJobs } from '../services/jobService.js';

export default function SavedJobs({ jobs, profile, saved, onRemove, onApply }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('Any');
  const visible = filterJobs(jobs.filter(job => saved.includes(job.id)), query, mode, 'Any');
  return <section><h1>Saved jobs</h1><div className="filters">
    <label>Search saved jobs<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, company, location"/></label>
    <label>Work arrangement<select value={mode} onChange={event => setMode(event.target.value)}>{['Any','Remote','Hybrid','On-site'].map(x => <option key={x}>{x}</option>)}</select></label>
  </div>{!visible.length && <p className="card">No saved jobs match. Save a job in Discover or clear your filters.</p>}
  <div className="job-grid">{visible.map(job => <JobCard key={job.id} job={job} skills={profile.skills}><button onClick={() => onRemove(job.id)}>Remove</button><button className="primary" onClick={() => onApply(job)}>Application options</button></JobCard>)}</div></section>;
}


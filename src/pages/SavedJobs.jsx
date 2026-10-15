import React, { useState } from 'react';
import ApplyButton from '../components/ApplyButton.jsx';
import JobCard from '../components/JobCard.jsx';
import { filterJobs } from '../services/jobService.js';

export default function SavedJobs({ jobs, saved, loading, error, onRetry, onRemove, onApply, onDetails, recommendations }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('Any');
  const visible = filterJobs(jobs.filter(job => saved.includes(job.id)), query, mode, 'Any');
  return <section><h1>Saved jobs</h1><div className="filters">
    <label>Search saved jobs<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, company, location"/></label>
    <label>Work arrangement<select value={mode} onChange={event => setMode(event.target.value)}>{['Any','Remote','Hybrid','On-site'].map(x => <option key={x}>{x}</option>)}</select></label>
  </div>
  {loading && <p role="status">Loading saved jobs...</p>}
  {error && <div className="notice" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Retry</button></div>}
  {!loading && !error && !visible.length && <p className="card">No saved jobs match. Save a job in Discover or clear your filters.</p>}
  {!loading && !error && <div className="job-grid">{visible.map(job => <JobCard key={job.id} job={job} recommendation={recommendations.find(match => match.jobId === job.id)} onDetails={onDetails}><button onClick={() => onRemove(job.id)}>Remove</button><ApplyButton job={job} onStart={onApply}/></JobCard>)}</div>}</section>;
}

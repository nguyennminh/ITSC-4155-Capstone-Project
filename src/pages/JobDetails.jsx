import React, { useEffect, useRef } from 'react';
import MatchExplanation from '../components/MatchExplanation.jsx';
import ApplyButton from '../components/ApplyButton.jsx';
import { safeExternalUrl } from '../services/linkService.js';
export default function JobDetails({ job, recommendation, source, onClose, onStart }) {
  const panel = useRef(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  function handleKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const url = safeExternalUrl(job.postingUrl);
  return <div className="details-overlay" role="dialog" aria-modal="true" aria-label="Job details" onKeyDown={handleKeyDown}>
    <section ref={panel} className="card details-panel"><button onClick={onClose}>Back to jobs</button>
      <h1>{job.title}</h1><p>{job.company} · {job.location}</p>
      <p>{job.salary || 'Salary not provided'} · {job.type || 'Employment type not provided'} · {job.mode || 'Arrangement not provided'}</p>
      <p>Source: {job.source}</p><h2>Description</h2>
      {job.descriptionIsSnippet && <p className="notice">The provider supplied a description excerpt. Open the original posting for the complete description.</p>}
      <p className="job-description">{job.description}</p>
      <MatchExplanation recommendation={recommendation} source={source}/>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer">Open original posting ↗</a> : <p>No valid original posting link is available.</p>}
      <ApplyButton job={job} onStart={onStart}/>
    </section>
  </div>;
}

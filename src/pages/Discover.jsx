import React, { useState } from 'react';
import JobCard from '../components/JobCard.jsx';
import { filterJobs, matchSkills } from '../services/jobService.js';

export default function Discover({ jobs, profile, saved, onSave, onApply }) {
  const [skipped, setSkipped] = useState([]);
  const [startX, setStartX] = useState(null);
  const available = filterJobs(jobs, '', profile.mode, profile.type)
    .filter(job => !skipped.includes(job.id))
    .sort((a, b) => matchSkills(b, profile.skills).score - matchSkills(a, profile.skills).score);
  const job = available[0];
  function skip() { setSkipped([...skipped, job.id]); }
  return <section><h1>Discover jobs</h1><p>Swipe left to skip, right to save. Buttons do the same thing.</p>
    {!job ? <div className="card"><h2>No more jobs for these preferences</h2><p>Change your profile filters or review skipped jobs.</p><button onClick={() => setSkipped([])}>Review skipped jobs</button></div>
    : <div className="swipe-surface" onTouchStart={event => setStartX(event.touches[0].clientX)} onTouchEnd={event => {
      if (startX === null) return;
      const distance = event.changedTouches[0].clientX - startX;
      if (distance < -70) skip();
      if (distance > 70) { onSave(job.id); skip(); }
      setStartX(null);
    }}><JobCard job={job} skills={profile.skills}>
      <button onClick={skip}>Skip</button><button disabled={saved.includes(job.id)} onClick={() => onSave(job.id)}>{saved.includes(job.id) ? 'Saved' : 'Save job'}</button>
      <button className="primary" onClick={() => onApply(job)}>Application options</button>
    </JobCard></div>}
  </section>;
}


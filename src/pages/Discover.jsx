import React, { useEffect, useRef, useState } from 'react';
import JobCard from '../components/JobCard.jsx';
import { filterJobs, matchSkills } from '../services/jobService.js';
import { getAiMatches } from '../services/resumeService.js';

export default function Discover({ jobs, profile, confirmed, saved, onSave, onApply, onReview }) {
  const [skipped, setSkipped] = useState([]);
  const [startX, setStartX] = useState(null);
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function runMatching() {
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    setMatches(null);
    try {
      const result = await getAiMatches(profile, request.signal);
      if (!request.signal.aborted) {
        setMatches(result.matches);
        setSkipped([]);
      }
    } catch (err) {
      if (!request.signal.aborted) setError(err.message);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  const eligible = filterJobs(jobs, '', profile.mode, profile.type);
  const score = job => matches
    ? (matches.find(item => item.jobId === job.id)?.score ?? 0)
    : matchSkills(job, profile.skills).score;
  const available = eligible.filter(job => !skipped.includes(job.id)).sort((a, b) => score(b) - score(a));
  const job = available[0];
  function skip() { if (job) setSkipped(current => [...current, job.id]); }
  function saveAndSkip() { if (job) { onSave(job.id); skip(); } }

  return <section>
    <h1>Discover jobs</h1>
    <p>Swipe left to skip, right to save. These listings are still fictional sample jobs.</p>
    <div className="card">
      <h2>AI job matching</h2>
      <p>Compare your confirmed qualifications with each job and see supporting reasons and requirements not found in your profile.</p>
      {!confirmed && <p className="notice">Review your information before using AI matching. <button onClick={onReview}>Review information</button></p>}
      <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>
        Send my qualification fields and preferences to Google Gemini for this match request. Name and email fields are excluded; remove contact details from free-text fields yourself.
      </label>
      <button className="primary" disabled={!confirmed || !consent || loading || !eligible.length} onClick={runMatching}>
        {loading ? 'Matching…' : 'Find AI matches'}
      </button>
      {loading && <p role="status">Comparing qualifications with available jobs…</p>}
      {error && <p className="profile-error" role="alert">{error} Keyword results remain available below.</p>}
      <p className="muted" role="status">{matches ? 'Sorted by AI fit estimate. This is not a hiring probability.' : 'Currently sorted by keyword skill overlap, not AI.'}</p>
    </div>
    {!job ? <div className="card"><h2>No more jobs for these preferences</h2><p>Change your preferences or review skipped jobs.</p><button onClick={() => setSkipped([])}>Review skipped jobs</button></div>
      : <div className="swipe-surface" onTouchStart={event => setStartX(event.touches[0].clientX)} onTouchCancel={() => setStartX(null)} onTouchEnd={event => {
        if (startX === null) return;
        const distance = event.changedTouches[0].clientX - startX;
        if (distance < -70) skip();
        if (distance > 70) saveAndSkip();
        setStartX(null);
      }}>
        <JobCard job={job} skills={profile.skills} aiMatch={matches?.find(item => item.jobId === job.id)}>
          <button onClick={skip}>Skip</button>
          <button disabled={saved.includes(job.id)} onClick={saveAndSkip}>{saved.includes(job.id) ? 'Saved' : 'Save job'}</button>
          <button className="primary" onClick={() => onApply(job)}>Application options</button>
        </JobCard>
      </div>}
  </section>;
}
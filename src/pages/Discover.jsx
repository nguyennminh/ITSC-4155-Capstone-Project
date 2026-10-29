import React, { useEffect, useRef, useState } from 'react';
import ApplyButton from '../components/ApplyButton.jsx';
import JobCard from '../components/JobCard.jsx';
import useSwipe from '../hooks/useSwipe.js';
import { getMatches } from '../services/resumeService.js';

export default function Discover({ jobs, profile, confirmed, saved, onSave, onApply, onReview, onDetails, onResults, onRefreshJobs, accountId }) {
  const storageKey = `jobswipe-skips:${accountId}`;
  const [skipped, setSkipped] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value.filter(id => typeof id === 'string') : []; }
    catch { return []; }
  });
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(skipped)); } catch { /* Storage can be disabled. */ } }, [storageKey, skipped]);
  const [saving, setSaving] = useState(false);
  const [decisionNotice, setDecisionNotice] = useState('');
  const decisionPending = useRef(false);
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function runMatching() {
    setLoading(true); setError(''); setNotice('');
    setMatches(null);
    onResults({ jobs, matches: [], source: 'pending' });
    try {
      const result = await getMatches();
      setMatches(result.matches); onResults(result);
      setNotice(result.message || '');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const available = (matches || []).filter(match => !skipped.includes(String(match.jobId)) && !saved.some(id => String(id) === String(match.jobId)));
  const current = available[0];
  const job = jobs.find(job => job.id === current?.jobId);
  const resumeSkills = String(profile.skills || '').split(/[,;\n|]+/).map(skill => skill.trim()).filter(Boolean);
  function advance(id) { setSkipped(ids => [...new Set([...ids, String(id)])]); }
  function skip() {
    if (!job || decisionPending.current || loading) return;
    advance(job.id); setDecisionNotice(`Skipped ${job.title}.`);
  }
  async function saveAndSkip() {
    if (!job || decisionPending.current || loading) return;
    decisionPending.current = true; setSaving(true); setError('');
    const selected = job;
    try {
      const success = await onSave(selected);
      if (success === false) throw new Error('Job could not be saved. Try again.');
      advance(selected.id); setDecisionNotice(`Saved ${selected.title}.`);
    } catch (err) { setError(err.message); }
    finally { decisionPending.current = false; setSaving(false); }
  }
  const gestures = useSwipe({ onLeft:skip, onRight:saveAndSkip, disabled:saving || loading });
  return <section>
    <h1>Discover jobs</h1>
    <p>Swipe left to skip, right to save. Listings supplied by Adzuna.</p>
    <button type="button" disabled={saving || loading} onClick={onRefreshJobs}>Refresh Adzuna jobs</button>
    <div className="card">
      <h2>Find your strongest matches</h2>
      <p>Compare your confirmed skills and experience with available job listings. Explore the evidence behind each match, review potential gaps, and request a deeper explanation when you want more context.</p>
      <p className="muted">Your confirmed skill names are sent to Adzuna to search listings. Ranking does not send your profile to Gemini. Unknown work arrangements are retained; verify them in the original posting.</p>
      {confirmed && <div aria-label="Skills used for matching">
        <strong>Skills from your confirmed resume/profile</strong>
        {resumeSkills.length
          ? <div className="tags">{resumeSkills.map((skill, index) => <span key={`${skill}-${index}`}>{skill}</span>)}</div>
          : <p className="muted">No skills are saved. Add skills in your profile or review your resume information.</p>}
      </div>}
      {!confirmed && <p className="notice">Confirm your information first. <button onClick={onReview}>Review information</button></p>}
      <button className="primary" disabled={!confirmed || loading || saving || !jobs.length} onClick={runMatching}>
        {loading ? 'Ranking jobs…' : 'Rank jobs'}
      </button>
      <p className="muted">Scores are subjective fit estimates, not hiring probabilities. Adzuna descriptions may be excerpts; review the original posting for full requirements.</p>
      {error && <p className="profile-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!matches && confirmed && !loading && jobs.length > 0 && <p className="muted">Rank jobs to see recommendations.</p>}
    </div>
    {confirmed && !loading && matches && !job && <div className="card">
      <h2>{matches.length ? 'You have reviewed all matches' : 'No matching jobs'}</h2>
      <p>Update your qualifications or broaden your preferences to find other opportunities.</p>
      {matches.length > 0 && <button onClick={() => setSkipped([])}>Review skipped jobs</button>}
    </div>}
    <p id="swipe-help" className="muted">Drag the card sideways, use the buttons, or focus the card and use left/right arrow keys. Skips are remembered in this browser tab for your account.</p>
    <p role="status" aria-live="polite">{saving ? 'Saving job…' : decisionNotice}</p>
    {job && <div className="swipe-surface" role="region" aria-label="Current recommended job" aria-describedby="swipe-help" aria-busy={saving} tabIndex={0} {...gestures}>
      <JobCard job={job} recommendation={current} onDetails={onDetails}>
        <button disabled={saving} onClick={skip}>Skip</button>
        <button disabled={saving} onClick={saveAndSkip}>{saving ? 'Saving…' : 'Save job'}</button>
        <ApplyButton job={job} onStart={onApply}/>
      </JobCard>
    </div>}
  </section>;
}

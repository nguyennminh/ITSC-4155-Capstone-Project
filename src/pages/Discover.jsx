import React, { useEffect, useRef, useState } from 'react';
import ApplyButton from '../components/ApplyButton.jsx';
import JobCard from '../components/JobCard.jsx';
import { getMatches } from '../services/resumeService.js';

export default function Discover({ jobs, profile, confirmed, saved, onSave, onApply, onReview, onDetails, onResults, source }) {
  const [skipped, setSkipped] = useState([]);
  const [startX, setStartX] = useState(null);
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const controller = useRef(null);
  useEffect(() => {
    if (confirmed) runMatching(false);
    return () => controller.current?.abort();
  }, [confirmed]);
  async function runMatching(useAi) {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(''); setNotice('');
    try {
      const result = await getMatches(useAi, request.signal);
      if (!request.signal.aborted) {
        setMatches(result.matches); onResults(result); setSkipped([]);
        setNotice(result.warning || result.message || '');
      }
    } catch (err) { if (!request.signal.aborted) setError(err.message); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  const available = (matches || []).filter(match => !skipped.includes(match.jobId));
  const current = available[0];
  const job = jobs.find(job => job.id === current?.jobId);
  const resumeSkills = String(profile.skills || '').split(/[,;\n|]+/).map(skill => skill.trim()).filter(Boolean);
  function skip() { if (job) setSkipped(ids => [...ids, job.id]); }
  function saveAndSkip() { if (job) { onSave(job.id); skip(); } }
  return <section>
    <h1>Discover jobs</h1>
    <p>Swipe left to skip, right to save. Listings supplied by Adzuna.</p>
    <div className="card">
      <h2>Match your confirmed qualifications</h2>
      <p>Jobs can match when at least one of your skills appears in the listing, even if Adzuna does not label it as a skill. Scores use a keyword formula: up to 90 points for skill overlap, plus 5 each for preferred title and location. Work arrangement and employment type filter jobs.</p>
      <p className="muted">Your confirmed skill names are sent to Adzuna as alternative search terms, so listings matching any of your skills can be considered. Your resume text and personal details are not sent.</p>
      {confirmed && <div aria-label="Skills used for matching">
        <strong>Skills from your confirmed resume/profile</strong>
        {resumeSkills.length
          ? <div className="tags">{resumeSkills.map((skill, index) => <span key={`${skill}-${index}`}>{skill}</span>)}</div>
          : <p className="muted">No skills are saved. Add skills in your profile or review your resume information.</p>}
      </div>}
      {!confirmed && <p className="notice">Confirm your information first. <button onClick={onReview}>Review information</button></p>}
      <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>
        Use Gemini to rank jobs by sending my qualification fields and preferences to Google. Name/email fields are excluded; remove personal details from free text. Free-tier content may be used for product improvement.
      </label>
      <button className="primary" disabled={!confirmed || loading} onClick={() => runMatching(consent)}>{loading ? 'Matching…' : 'Refresh matches'}</button>
      <p className="muted">With AI disabled or unavailable, scores use keyword matching. Scores are not hiring probabilities.</p>
      {loading && <p role="status">Comparing your saved profile with jobs…</p>}
      {error && <p className="profile-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
    </div>
    {confirmed && !loading && matches && !job && <div className="card">
      <h2>{matches.length ? 'You have reviewed all matches' : 'No matching jobs'}</h2>
      <p>Update your qualifications or broaden your preferences to find other opportunities.</p>
      {matches.length > 0 && <button onClick={() => setSkipped([])}>Review skipped jobs</button>}
    </div>}
    {job && <div className="swipe-surface" onTouchStart={event => setStartX(event.touches[0].clientX)} onTouchCancel={() => setStartX(null)} onTouchEnd={event => {
      if (startX === null) return;
      const distance = event.changedTouches[0].clientX - startX;
      if (distance < -70) skip();
      if (distance > 70) saveAndSkip();
      setStartX(null);
    }}>
      <JobCard job={job} skills={profile.skills} recommendation={current} source={source} onDetails={onDetails}>
        <button onClick={skip}>Skip</button>
        <button disabled={saved.includes(job.id)} onClick={saveAndSkip}>{saved.includes(job.id) ? 'Saved' : 'Save job'}</button>
        <ApplyButton job={job} onStart={onApply}/>
      </JobCard>
    </div>}
  </section>;
}

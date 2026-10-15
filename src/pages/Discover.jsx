import React, { useState } from 'react';
import ApplyButton from '../components/ApplyButton.jsx';
import JobCard from '../components/JobCard.jsx';
import { getMatches } from '../services/resumeService.js';

export default function Discover({ jobs, profile, confirmed, saved, onSave, onApply, onReview, onDetails, onResults, onRefreshJobs }) {
  const [skipped, setSkipped] = useState([]);
  const [startX, setStartX] = useState(null);
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);

  async function runGeminiMatching() {
    setLoading(true); setError(''); setNotice('');
    setMatches(null);
    onResults({ jobs, matches: [], source: 'gemini' });
    try {
      const result = await getMatches(consent);
      setMatches(result.matches); onResults(result); setSkipped([]);
      setNotice(result.message || '');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const available = (matches || []).filter(match => !skipped.includes(match.jobId));
  const current = available[0];
  const job = jobs.find(job => job.id === current?.jobId);
  const resumeSkills = String(profile.skills || '').split(/[,;\n|]+/).map(skill => skill.trim()).filter(Boolean);
  function skip() { if (job) setSkipped(ids => [...ids, job.id]); }
  function saveAndSkip() { if (job) { onSave(job); skip(); } }
  return <section>
    <h1>Discover jobs</h1>
    <p>Swipe left to skip, right to save. Listings supplied by Adzuna.</p>
    <button type="button" onClick={onRefreshJobs}>Refresh Adzuna jobs</button>
    <div className="card">
      <h2>Match jobs with Gemini reasoning</h2>
      <p>Gemini compares your confirmed qualifications with each available job’s title, requirements, and description. It returns a fit estimate, specific evidence for the match, and requirements not found in your profile. Work arrangement and employment type filter jobs.</p>
      <p className="muted">Your confirmed skill names are sent to Adzuna as alternative search terms. When you choose to match, your qualification fields and preferences, plus each job’s title, company, location, listed skills, and description, are sent to Google Gemini. Your name, email, and raw resume are excluded; personal details included in free-text fields may be sent.</p>
      {confirmed && <div aria-label="Skills used for matching">
        <strong>Skills from your confirmed resume/profile</strong>
        {resumeSkills.length
          ? <div className="tags">{resumeSkills.map((skill, index) => <span key={`${skill}-${index}`}>{skill}</span>)}</div>
          : <p className="muted">No skills are saved. Add skills in your profile or review your resume information.</p>}
      </div>}
      {!confirmed && <p className="notice">Confirm your information first. <button onClick={onReview}>Review information</button></p>}
      <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/>
        I agree to send my confirmed qualification fields and preferences, plus the listed job details, to Google Gemini for matching. Name/email fields and raw resume files are excluded. Remove personal details from free-text fields. Google’s applicable data-use terms apply.
      </label>
      <button className="primary" disabled={!confirmed || loading || !consent || !jobs.length} onClick={runGeminiMatching}>
        {loading ? 'Gemini is reasoning about your matches…' : 'Rank jobs with Gemini'}
      </button>
      <p className="muted">Scores are subjective fit estimates, not hiring probabilities. Adzuna descriptions may be excerpts; review the original posting and Gemini’s cited evidence.</p>
      {error && <p className="profile-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!matches && confirmed && !loading && jobs.length > 0 && <p className="muted">Agree to the data-sharing notice and rank jobs with Gemini to see recommendations.</p>}
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
      <JobCard job={job} recommendation={current} onDetails={onDetails}>
        <button onClick={skip}>Skip</button>
        <button disabled={saved.includes(job.id)} onClick={saveAndSkip}>{saved.includes(job.id) ? 'Saved' : 'Save job'}</button>
        <ApplyButton job={job} onStart={onApply}/>
      </JobCard>
    </div>}
  </section>;
}

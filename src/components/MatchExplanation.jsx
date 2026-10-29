import React, { useEffect, useRef, useState } from 'react';
import { jsonPost } from '../services/resumeService.js';

export default function MatchExplanation({ recommendation, job }) {
  const [consent, setConsent] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setConsent(false); setExplanation(null); setLoading(false); setError('');
    return () => { request.current++; };
  }, [job?.id, recommendation]);

  async function explain() {
    if (!consent || loading || !job) return;
    const id = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await jsonPost('/api/jobs/explain', { consent: true, jobId: String(job.id) });
      if (id === request.current) setExplanation(result.explanation);
    } catch (err) { if (id === request.current) setError(err.message); }
    finally { if (id === request.current) setLoading(false); }
  }

  if (!recommendation) return <p>Rank jobs in Discover to see a recommendation.</p>;
  const matched = recommendation.matched || [];
  const missing = recommendation.missing || [];
  const evidence = recommendation.evidence || [];
  return <section className="match-explanation" aria-label="Match insights" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <h3>{recommendation.score}/100 · fit estimate</h3>
    <h4>Why this role is worth a look</h4>
    <p>{matched.length ? `Your confirmed qualifications mention ${matched.join(', ')}, which also appear in this listing. The connections below show where that overlap comes from; a mention alone does not establish proficiency or experience level.` : 'Review the evidence below to assess how your background connects to this role.'}</p>
    {evidence.length > 0 ? <div className="evidence-grid">{evidence.map(item => <div className="evidence-item" key={item.skill}>
      <strong>{item.skill}</strong>
      <p><span className="muted">Your {item.profileSource.toLowerCase()}: </span>“{item.profileExcerpt}”</p>
      {item.jobExcerpt ? <p><span className="muted">Listing evidence: </span>“{item.jobExcerpt}”</p> : <p className="muted">This skill appears in the listing’s skill tags. Check the full posting for how it is used.</p>}
    </div>)}</div> : <ul>{(recommendation.reasons || []).map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
    <h4>Gaps to review before applying</h4>
    {missing.length ? <><p>The listing mentions these skills, but we did not find them in your confirmed qualifications:</p><div className="tags">{missing.map(skill => <span key={skill}>{skill}</span>)}</div><p className="muted">If you have relevant experience, add a specific example to your profile. Otherwise, check whether these are essential or preferred in the full posting.</p></> : <p>No gaps were found among the listed skill tags. Experience level, responsibilities, and other requirements still need review.</p>}
    {recommendation.warnings?.map(warning => <p className="notice" key={warning}>{warning}</p>)}
    {job && <div className="deeper-insights">
      <h4>A deeper look with Gemini</h4>
      <p>Connect your experience and projects to the role’s responsibilities, explore transferable strengths, and identify questions to check before applying.</p>
      {!explanation && <>
        <label className="checkbox-label"><input type="checkbox" checked={consent} disabled={loading} onChange={event => setConsent(event.target.checked)}/>I agree to send my confirmed qualifications and preferences and this job’s details to Google Gemini for this explanation. Name, email and raw resume are excluded; personal details in free-text fields may be sent. Google’s data-use terms apply.</label>
        <button type="button" disabled={!consent || loading} onClick={explain}>{loading ? 'Reviewing your experience…' : 'Expand match evidence with Gemini'}</button>
      </>}
      {error && <p className="profile-error" role="alert">{error}</p>}
      <div aria-live="polite" aria-busy={loading}>{explanation && <>
        <p className="muted">Gemini’s assessment of your background and this listing</p>
        <ul>{explanation.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
        {explanation.matched?.length > 0 && <><h4>Relevant strengths</h4><ul>{explanation.matched.map((strength, i) => <li key={i}>{strength}</li>)}</ul></>}
        {explanation.missing?.length > 0 && <><h4>Additional requirements to verify</h4><ul>{explanation.missing.map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
        <p className="muted">AI explanations may miss context or make mistakes. Check each connection against your experience and the original posting.</p>
      </>}</div>
    </div>}
    <small>A fit estimate is not a hiring probability. Listing excerpts can omit requirements; review the full posting before applying.</small>
  </section>;
}

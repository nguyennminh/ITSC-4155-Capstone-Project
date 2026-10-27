import React, { useRef, useState } from 'react';
import { requestResumeSuggestions } from '../services/resumeSuggestionService.js';
import { applySuggestion, suggestionTargets, suggestionLabel } from '../data/resumeSuggestionTargets.js';
export default function ResumeSuggestions({ profile, onApply, disabled }) {
  const [consent, setConsent] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [findings, setFindings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function request() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setSuggestions(null); setFindings([]);
    try { const result = await requestResumeSuggestions(consent); setSuggestions(result.suggestions); setFindings(result.findings || []); }
    catch (err) { setError(err.message); }
    finally { pending.current = false; setBusy(false); }
  }
  function apply(suggestion) {
    try { onApply(applySuggestion(profile, suggestion)); setSuggestions(items => items.filter(item => item !== suggestion)); setError(''); }
    catch (err) { setError(err.message); }
  }
  return <section className="card resume-suggestions" aria-label="AI resume suggestions">
    <h2>Improve your resume</h2>
    <p>Request suggestions for the last parsed draft or saved qualifications. Save or reparse changes before requesting new feedback. Accepting an edit here does not save your profile.</p>
    <p className="muted">Only qualification fields, experience/project bullets, and your desired title are sent to Google Gemini. Name, email, phone, and the original file are excluded. Personal details typed into qualification fields may still be sent. Feedback covers text and structure, not visual document layout. Check every suggestion for accuracy.</p>
    <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>I agree to send these qualification fields to Google Gemini for resume feedback.</label>
    <button type="button" className="primary" disabled={!consent || busy || disabled} onClick={request}>{busy ? 'Reviewing resume…' : 'Get AI resume suggestions'}</button>
    {error && <p role="alert" className="profile-error">{error}</p>}
    {busy && <p role="status">Preparing resume suggestions…</p>}
    {suggestions?.length === 0 && !findings.length && <p role="status">No remaining suggestions. Review your information and confirm any changes.</p>}
    {findings.map((finding,index) => <article className="suggestion-item" key={`${finding.category}-${index}`}>
      <h3>{finding.category} · review recommendation</h3><p>{finding.message}</p>
      <p className="muted">Update the relevant field yourself if this applies. No facts are added automatically.</p>
      <button type="button" onClick={() => setFindings(items => items.filter((_,i) => i !== index))}>Dismiss recommendation</button>
    </article>)}
    {suggestions?.map(suggestion => {
      const stale = suggestionTargets(profile).find(target => target.id === suggestion.target)?.text !== suggestion.before;
      return <article className="suggestion-item" key={suggestion.target}>
        <h3>{suggestion.category}: {suggestionLabel(profile, suggestion.target)}</h3>
        <p>{suggestion.reason}</p><p><strong>Current:</strong> {suggestion.before}</p><p><strong>Suggested:</strong> {suggestion.after}</p>
        {stale && <p className="muted">This field changed. Request fresh feedback to update it.</p>}
        <div className="actions"><button type="button" disabled={stale || disabled} onClick={() => apply(suggestion)}>Apply suggestion</button>
        <button type="button" onClick={() => setSuggestions(items => items.filter(item => item !== suggestion))}>Dismiss suggestion</button></div>
      </article>;
    })}
  </section>;
}

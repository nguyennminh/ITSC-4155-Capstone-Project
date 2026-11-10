import React from 'react';
import { ArrowRight, Check, CircleHelp, House, Sparkles } from 'lucide-react';

export default function MatchInsights({ job, recommendation, profile, onDetails }) {
  const matched = [...new Set(recommendation?.matched || [])];
  const missing = [...new Set(recommendation?.missing || [])];
  const score = recommendation?.score;
  const hasScore = Number.isFinite(score);
  const preferredMode = profile.mode?.trim().toLowerCase();
  const matchesMode = ['remote', 'hybrid', 'on-site'].includes(preferredMode) && preferredMode === job.mode?.trim().toLowerCase();

  return <aside className="match-insights" aria-label="Why it’s a match">
    <div className="insight-heading"><Sparkles size={21} aria-hidden="true"/><div><h2>Why it’s a match</h2><p>Based on your confirmed profile</p></div></div>
    {hasScore && <div className="insight-score">
      <div className="insight-score-ring" style={{ '--match-progress': `${Math.max(0, Math.min(100, score))}%` }}><span><b>{score}</b><small>/100</small></span></div>
      <div><strong>Profile fit estimate</strong><p>How your qualifications align with this listing.</p></div>
    </div>}
    <ul className="insight-factors">
      <li><Check size={16} aria-hidden="true"/><div><strong>{matched.length ? `${matched.length} ${matched.length === 1 ? 'skill' : 'skills'} in common` : 'Review your fit'}</strong><p>{matched.length ? matched.join(', ') : 'No confirmed skill overlap was found. Review the full requirements.'}</p></div></li>
      {matchesMode && <li><House size={16} aria-hidden="true"/><div><strong>Work style matches</strong><p>{job.mode} matches your preference.</p></div></li>}
      {missing.length > 0 && <li className="insight-gap"><CircleHelp size={16} aria-hidden="true"/><div><strong>{missing.length} {missing.length === 1 ? 'skill' : 'skills'} to review</strong><p>{missing.join(', ')}</p><small>Not found in your confirmed qualifications.</small></div></li>}
    </ul>
    {!matched.length && recommendation?.reasons?.length > 0 && <p className="insight-context">{recommendation.reasons[0]}</p>}
    {recommendation?.warnings?.map(warning => <p className="insight-context" key={warning}>{warning}</p>)}
    {onDetails && <button type="button" className="insight-details" onClick={() => onDetails(job, recommendation)}>View full job details <ArrowRight size={16} aria-hidden="true"/></button>}
    <p className="insight-footnote">A fit estimate isn’t a hiring probability. Review the evidence and full requirements before applying.</p>
  </aside>;
}

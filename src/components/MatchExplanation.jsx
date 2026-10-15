import React from 'react';
export default function MatchExplanation({ recommendation, source = 'deterministic' }) {
  if (!recommendation) return <p>Refresh matches in Discover to see a recommendation.</p>;
  const matchedSkills = recommendation.matched || [];
  const explanation = source === 'gemini'
    ? recommendation.aiReasons || []
    : recommendation.reasons || [];
  return <section className="match-explanation">
    <h3>{recommendation.score}/100 · {source === 'gemini' ? 'AI fit estimate' : 'Keyword fit score'}</h3>
    <p>Skills from your confirmed qualifications found in this listing:</p>
    {matchedSkills.length
      ? <div className="tags">{matchedSkills.map(skill => <span key={skill}>{skill}</span>)}</div>
      : <p>None detected.</p>}
    <h4>Requirements not evidenced in your profile</h4>
    {recommendation.missing?.length ? <ul>{recommendation.missing.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p>No missing listed skills detected. This is not a complete qualification assessment.</p>}
    {explanation.length > 0 && <>
      <h4>{source === 'gemini' ? 'AI explanation' : 'Match details'}</h4>
      <ul>{explanation.map((reason,i) => <li key={i}>{reason}</li>)}</ul>
    </>}
    <small>A score is a fit estimate, not a hiring probability. Skills are inferred from available description text.</small>
  </section>;
}

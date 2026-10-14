import React from 'react';
export default function MatchExplanation({ recommendation, source = 'deterministic' }) {
  if (!recommendation) return <p>Refresh matches in Discover to see a recommendation.</p>;
  return <section className="match-explanation">
    <h3>{recommendation.score}/100 · {source === 'gemini' ? 'AI fit estimate' : 'Keyword fit score'}</h3>
    <p>Matching skills evidenced in your confirmed qualifications: {recommendation.matched?.join(', ') || 'None detected'}.</p>
    <h4>Requirements not evidenced in your profile</h4>
    {recommendation.missing?.length ? <ul>{recommendation.missing.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p>No missing listed skills detected. This is not a complete qualification assessment.</p>}
    <ul>{recommendation.reasons.map((reason,i) => <li key={i}>{reason}</li>)}</ul>
    <small>A score is a fit estimate, not a hiring probability. Skills are inferred from available description text.</small>
  </section>;
}

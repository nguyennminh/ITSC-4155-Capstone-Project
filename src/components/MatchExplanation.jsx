import React from 'react';
export default function MatchExplanation({ recommendation }) {
  if (!recommendation) return <p>Rank jobs with Gemini in Discover to see a recommendation.</p>;
  const matchedSkills = recommendation.matched || [];
  const explanation = recommendation.aiReasons || recommendation.reasons || [];
  return <section className="match-explanation">
    <h3>{recommendation.score}/100 · Gemini fit estimate</h3>
    <p>Qualifications Gemini identified as relevant:</p>
    {matchedSkills.length
      ? <div className="tags">{matchedSkills.map(skill => <span key={skill}>{skill}</span>)}</div>
      : <p>None detected.</p>}
    <h4>Requirements not evidenced in your profile</h4>
    {recommendation.missing?.length ? <ul>{recommendation.missing.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p>No missing listed skills detected. This is not a complete qualification assessment.</p>}
    {explanation.length > 0 && <>
      <h4>Gemini’s reasoning</h4>
      <ul>{explanation.map((reason,i) => <li key={i}>{reason}</li>)}</ul>
    </>}
    <small>A score is a fit estimate, not a hiring probability. Reasoning is based on the confirmed profile fields and available job description; review the full posting.</small>
  </section>;
}

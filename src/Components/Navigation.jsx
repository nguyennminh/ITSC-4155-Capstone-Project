import React from 'react';

export default function Navigation({ page, navigate, role, logout }) {
  const links = role === 'Recruiter'
    ? [['recruiter', 'Applicants']]
    : [['discover', 'Discover'], ['saved', 'Saved Jobs'], ['applications', 'Applications'], ['profile', 'Profile']];
  return <header className="navigation">
    <strong className="brand">JobSwipe</strong>
    <nav aria-label="Main navigation">
      {links.map(([id, label]) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</button>)}
    </nav>
    <button onClick={logout}>Exit demo</button>
  </header>;
}


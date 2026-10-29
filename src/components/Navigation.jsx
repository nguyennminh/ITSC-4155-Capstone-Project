
import React, { useEffect, useState } from 'react';

export default function Navigation({ page, navigate, role, logout, logoutBusy }) {
  const links = role === 'Recruiter'
    ? [['recruiter', 'Applicants']]
    : [['discover', 'Discover'], ['saved', 'Saved Jobs'], ['applications', 'Applications'], ['profile', 'Profile']];

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('jobswipe-theme') === 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      darkMode ? 'dark' : 'light'
    );
    localStorage.setItem('jobswipe-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return <header className="navigation">
    <strong className="brand">
      <img
        src="/jobswipe-logo.jpg"
        alt=""
        className="brand-logo"
      />
      <span>JobSwipe</span>
    </strong>

    <nav aria-label="Main navigation">
      {links.map(([id, label]) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</button>)}
    </nav>

    <button
      type="button"
      className="theme-toggle"
      onClick={() => setDarkMode(!darkMode)}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={darkMode}
    >
      {darkMode ? '☀️ Light' : '🌙 Dark'}
    </button>

    <button onClick={logout} disabled={logoutBusy}>
      {logoutBusy ? 'Signing out…' : 'Sign out'}
    </button>
  </header>;
}

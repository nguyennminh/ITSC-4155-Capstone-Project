import React, { useEffect, useRef, useState } from 'react';

const icons = {
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6Z" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z" /><circle cx="12" cy="12" r="3" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
};

function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

export default function Navigation({ page, navigate, role, profile, savedCount, logout, logoutBusy, inert }) {
  const links = [
    ...(role === 'Recruiter'
      ? [['recruiter', 'Applicants', 'send']]
      : [['discover', 'Discover', 'compass'], ['saved', 'Saved', 'heart'], ['applications', 'Applications', 'send']]),
    ['profile', 'Profile', 'user'],
  ];
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('jobswipe-theme') === 'dark');
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef(null);
  const trigger = useRef(null);
  const name = profile?.name?.trim() || 'Your account';
  const initials = profile?.name?.trim().split(/\s+/).filter(Boolean).map(part => Array.from(part)[0]).filter(Boolean);
  const avatar = initials?.length ? `${initials[0]}${initials.length > 1 ? initials.at(-1) : ''}`.toUpperCase() : 'JS';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('jobswipe-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => { setAccountOpen(false); }, [page, inert]);

  useEffect(() => {
    if (!accountOpen) return;
    function outside(event) {
      if (!account.current?.contains(event.target)) setAccountOpen(false);
    }
    function escape(event) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [accountOpen]);

  return <aside className="sidebar" aria-label="Sidebar" inert={inert}>
    <strong className="brand">
      <img src="/jobswipe-logo.jpg" alt="" className="brand-logo" />
      <span>JobSwipe</span>
    </strong>
    <nav aria-label="Main navigation">
      {links.map(([id, label, icon]) => <button type="button" key={id} aria-label={label} aria-describedby={id === 'saved' ? 'saved-job-count' : undefined} className={[id === 'profile' ? 'mobile-profile' : '', page === id ? 'active' : ''].filter(Boolean).join(' ')} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}>
        <Icon name={icon} /><span>{label}</span>
        {id === 'saved' && <i id="saved-job-count" className="saved-count" aria-label={`${savedCount} saved jobs`}>{savedCount}</i>}
      </button>)}
    </nav>
    <div className="sidebar-bottom">
      <button type="button" className={page === 'profile' ? 'active' : ''} aria-current={page === 'profile' ? 'page' : undefined} onClick={() => navigate('profile')}>
        <Icon name="settings" /><span>Preferences</span>
      </button>
      <div className="sidebar-account" ref={account} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
      }}>
        <button type="button" className="user-card" ref={trigger} aria-label="Account options" aria-expanded={accountOpen} aria-controls="account-options" onClick={() => setAccountOpen(open => !open)}>
          <span className="avatar" aria-hidden="true">{avatar}</span>
          <span className="user-details"><b>{name}</b><small>{profile?.email || 'Manage your account'}</small></span>
          <Icon name="chevronDown" size={16} />
        </button>
        {accountOpen && <div id="account-options" className="account-options" role="group" aria-label="Account actions">
          <button type="button" className="theme-toggle" onClick={() => setDarkMode(mode => !mode)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={darkMode}>
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
          <button type="button" onClick={logout} disabled={logoutBusy}>{logoutBusy ? 'Signing out…' : 'Sign out'}</button>
        </div>}
      </div>
    </div>
  </aside>;
}

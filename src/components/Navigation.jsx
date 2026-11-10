import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Heart,
  Send,
  Settings,
  ChevronDown
} from "lucide-react";

const icons = {
  compass: Compass,
  heart: Heart,
  send: Send,
  settings: Settings,
  chevronDown: ChevronDown,
};

function Icon({ name, size = 20 }) {
  const IconComponent = icons[name];

  if (!IconComponent) return null;

  return (
    <IconComponent
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
    />
  );
}

export default function Navigation({ page, navigate, role, profile, accountEmail, savedCount, logout, logoutBusy, inert }) {
  const links = role === 'Recruiter'
    ? [['recruiter', 'Applicants', 'send']]
    : [['discover', 'Discover', 'compass'], ['saved', 'Saved', 'heart'], ['applications', 'Applications', 'send']];
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
      {links.map(([id, label, icon]) => <button type="button" key={id} aria-label={label} aria-describedby={id === 'saved' ? 'saved-job-count' : undefined} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}>
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
          <span className="user-details"><b>{name}</b></span>
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

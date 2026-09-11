import React, { useState } from 'react';

export default function Login({ onEnter }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Job seeker');
  return <main className="login-layout">
    <section><strong className="brand">JobSwipe</strong><h1>Find your next opportunity.</h1><p>A simple starting point for your job search.</p></section>
    <form className="card" onSubmit={event => { event.preventDefault(); onEnter(name.trim(), role); }}>
      <h2>{register ? 'Create account UI' : 'Welcome back'}</h2>
      <p className="notice">Demo only. No account is created, no password is collected, and all changes reset on refresh.</p>
      <label>Display name<input required value={name} onChange={event => setName(event.target.value)} placeholder="Your name"/></label>
      <label>Role<select value={role} onChange={event => setRole(event.target.value)}><option>Job seeker</option><option>Recruiter</option></select></label>
      <button className="primary">Enter demo</button>
      <button type="button" onClick={() => setRegister(!register)}>{register ? 'Back to login view' : 'View registration UI'}</button>
    </form>
  </main>;
}


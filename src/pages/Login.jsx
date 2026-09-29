import React, { useState } from 'react';
import { jsonPost } from '../services/resumeService.js';

export default function Login({ onEnter }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Job seeker');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await jsonPost(`/api/auth/${register ? 'register' : 'login'}`, { name, email, password, role });
      onEnter(result.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="login-layout">
    <section><strong className="brand">JobSwipe</strong><h1>Find your next opportunity.</h1><p>Sign in to save your resume information and return to it later.</p></section>
    <form className="card" onSubmit={submit}>
      <h2>{register ? 'Create account' : 'Welcome back'}</h2>
      {register && <label>Name<input required value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label>}
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>
      <label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)}/></label>
      {register && <><small>Use at least 10 characters.</small><label>Role<select value={role} onChange={event => setRole(event.target.value)}><option>Job seeker</option><option>Recruiter</option></select></label></>}
      <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <button type="button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Back to sign in' : 'Create an account'}</button></div>
      {error && <p role="alert" className="profile-error">{error}</p>}
    </form>
  </main>;
}

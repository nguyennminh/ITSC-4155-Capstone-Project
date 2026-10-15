import React, { useRef, useState } from 'react';
import { jsonPost } from '../services/resumeService.js';

export default function Login({ onEnter, notice }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Job seeker');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (register && !name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim() || !event.currentTarget.elements.email.validity.valid) {
      setError('Please enter a valid email address.'); return;
    }
    if (password.length < 10 || password.length > 128) {
      setError('Use a password of 10–128 characters.'); return;
    }
    submitting.current = true;
    setBusy(true); setError('');
    try {
      const result = await jsonPost(`/api/auth/${register ? 'register' : 'login'}`, { name: name.trim(), email: email.trim(), password, role });
      onEnter(result.user);
    } catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <main className="login-layout">
    <section><strong className="brand">JobSwipe</strong><h1>Find your next opportunity.</h1><p>Sign in to save your resume information and return to it later.</p></section>
    <form className="card" onSubmit={submit} noValidate aria-busy={busy}>
      <h2>{register ? 'Create account' : 'Welcome back'}</h2>
      {notice && <p role="status">{notice}</p>}
      {register && <label>Name<input name="name" autoComplete="name" required disabled={busy} value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required disabled={busy} maxLength={254} value={email} onChange={event => setEmail(event.target.value)}/></label>
      <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required disabled={busy} minLength={10} maxLength={128} aria-describedby="password-help" value={password} onChange={event => setPassword(event.target.value)}/></label>
      <small id="password-help">Use 10–128 characters.</small>
      {register && <label>Role<select disabled={busy} value={role} onChange={event => setRole(event.target.value)}><option>Job seeker</option><option>Recruiter</option></select></label>}
      <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <button type="button" disabled={busy} onClick={() => { setRegister(!register); setPassword(''); setError(''); }}>{register ? 'Back to sign in' : 'Create an account'}</button></div>
      {error && <p role="alert" className="profile-error">{error}</p>}
    </form>
  </main>;
}

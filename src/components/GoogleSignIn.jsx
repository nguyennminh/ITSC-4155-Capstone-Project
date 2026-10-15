import React, { useEffect, useRef, useState } from 'react';
import { jsonPost } from '../services/resumeService.js';

let scriptPromise;
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        scriptPromise = undefined;
        reject(new Error('Google sign-in could not load. Retry or use email and password.'));
      };
      const timer = setTimeout(fail, 15000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        if (!window.google?.accounts?.id) return fail();
        clearTimeout(timer);
        resolve(window.google.accounts.id);
      };
      script.onerror = fail;
      document.head.append(script);
    });
  }
  return scriptPromise;
}

export default function GoogleSignIn({ onEnter, busy, onBusy, onPending }) {
  const button = useRef(null);
  const locked = useRef(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState('loading');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Job seeker');
  const [password, setPassword] = useState('');

  function receive(result) {
    setError('');
    setPassword('');
    if (result.user) { enterRef.current(result.user); return; }
    setPending(result);
    onPending(true);
    setName(result.name || '');
    setState('pending');
  }
  useEffect(() => {
    let active = true;
    setState('loading');
    setError('');
    setPending(null);
    onPending(false);
    setPassword('');
    async function initialize() {
      try {
        const config = await jsonPost('/api/auth/google/start', {});
        if (!active) return;
        if (!config.enabled) { setState('disabled'); return; }
        const google = await loadGoogle();
        if (!active) return;
        google.initialize({ client_id: config.clientId, nonce: config.nonce,
          ux_mode: 'popup', auto_select: false,
          callback: async response => {
            if (!active || locked.current || busyRef.current) return;
            locked.current = true;
            onBusy(true);
            setError('');
            try {
              const result = await jsonPost('/api/auth/google', { credential: response.credential });
              if (active) receive(result);
            } catch (err) {
              if (active) { setError(err.message); setState('error'); }
            } finally {
              locked.current = false;
              if (active) onBusy(false);
            }
          } });
        google.renderButton(button.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with' });
        setState('ready');
      } catch (err) { if (active) { setError(err.message); setState('error'); } }
    }
    initialize();
    return () => { active = false; };
  }, [generation, onBusy, onPending]);

  async function complete(event) {
    event.preventDefault();
    if (locked.current || busyRef.current) return;
    locked.current = true;
    onBusy(true);
    setError('');
    try {
      receive(await jsonPost('/api/auth/google/complete', pending.nextStep === 'confirm_password'
        ? { password } : { name, role }));
    } catch (err) { setError(err.message); }
    finally { locked.current = false; onBusy(false); }
  }
  if (state === 'disabled') return null;
  return <section className="google-sign-in" aria-label="Google sign-in">
    <fieldset disabled={busy}>
      <div ref={button} hidden={state !== 'ready'} inert={busy ? true : undefined} />
      {state === 'loading' && <p role="status">Loading Google sign-in…</p>}
      {state === 'pending' && <form onSubmit={complete}>
        <h3>{pending.nextStep === 'confirm_password' ? 'Link your existing account' : 'Complete your Google account'}</h3>
        <p>{pending.email}</p>
        {pending.nextStep === 'confirm_password' ? <>
          <p>Confirm your JobSwipe password once to link Google to your account.</p>
          <label>Existing password<input type="password" autoComplete="current-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
        </> : <>
          <label>Name<input autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Role<select value={role} onChange={event => setRole(event.target.value)}><option>Job seeker</option><option>Recruiter</option></select></label>
        </>}
        <button className="primary">{busy ? 'Please wait…' : pending.nextStep === 'confirm_password' ? 'Link Google and sign in' : 'Finish Google registration'}</button>
      </form>}
      {error && <p role="alert" className="profile-error">{error}</p>}
      {state !== 'loading' && <button type="button" onClick={() => setGeneration(value => value + 1)}>
        {state === 'pending' ? 'Cancel Google sign-in' : 'Restart Google sign-in'}
      </button>}
    </fieldset>
  </section>;
}

import React, { useEffect, useState } from 'react';
import Navigation from './components/Navigation.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Discover from './pages/Discover.jsx';
import SavedJobs from './pages/SavedJobs.jsx';
import Applications from './pages/Applications.jsx';
import Recruiter from './pages/Recruiter.jsx';
import { emptyProfile } from './data/mockData.js';
import { getJobs } from './services/jobService.js';

export default function App() {
  // Shared state lives here so the pages stay simple. Refresh resets the demo.
  const [page, setPage] = useState('login');
  const [role, setRole] = useState('Job seeker');
  const [profile, setProfile] = useState(emptyProfile);
  const [jobs, setJobs] = useState([]);
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadJobs() {
    setLoading(true);
    setError('');
    try { setJobs(await getJobs()); }
    catch { setError('Could not load jobs. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadJobs(); }, []);

  function enter(name, selectedRole) {
    setProfile({ ...emptyProfile, name });
    setRole(selectedRole);
    setPage(selectedRole === 'Recruiter' ? 'recruiter' : 'onboarding');
  }
  function navigate(nextPage) { setPage(nextPage); setMessage(''); }
  function saveJob(id) {
    setSaved(current => current.includes(id) ? current : [...current, id]);
    setMessage('Job saved.');
  }
  function apply(job) {
    // Sample listings have no application URL. Never claim an application was sent.
    setApplications(current => current.some(item => item.id === job.id) ? current : [...current, { ...job, status: 'Started' }]);
    navigate('applications');
    setMessage('Demo: added to your tracker only. No application was submitted. Connect a provider application URL before enabling external Apply.');
  }
  function logout() {
    setProfile(emptyProfile); setSaved([]); setApplications([]); setMessage(''); setPage('login');
  }
  if (page === 'login') return <Login onEnter={enter}/>;

  return <>
    <Navigation page={page} navigate={navigate} role={role} logout={logout}/>
    <main className="container">
      <p className="demo-label">Student starter · fictional data · changes reset on refresh</p>
      {message && <p role="status" className="notice">{message}</p>}
      {['onboarding','profile'].includes(page) && <Onboarding key={page} editing={page === 'profile'} profile={profile} setProfile={setProfile} finish={() => navigate('discover')}/>}
      {loading && ['discover','saved'].includes(page) && <p role="status">Loading jobs…</p>}
      {error && <div role="alert">{error} <button onClick={loadJobs}>Retry</button></div>}
      {!loading && !error && page === 'discover' && <Discover jobs={jobs} profile={profile} saved={saved} onSave={saveJob} onApply={apply}/>}
      {!loading && !error && page === 'saved' && <SavedJobs jobs={jobs} profile={profile} saved={saved} onRemove={id => setSaved(saved.filter(value => value !== id))} onApply={apply}/>}
      {page === 'applications' && <Applications applications={applications} updateStatus={(id, status) => setApplications(applications.map(item => item.id === id ? { ...item, status } : item))}/>}
      {page === 'recruiter' && <Recruiter/>}
    </main>
  </>;
}


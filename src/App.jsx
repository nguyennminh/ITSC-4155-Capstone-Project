import React, { use, useEffect, useState } from 'react';
import Navigation from './components/Navigation.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Discover from './pages/Discover.jsx';
import SavedJobs from './pages/SavedJobs.jsx';
import Applications from './pages/Applications.jsx';
import Recruiter from './pages/Recruiter.jsx';
import Profile from "./pages/Profile.jsx"

import { emptyProfile } from './data/mockData.js';
import { getJobs } from './services/jobService.js';

// creating email profile
const intialProfile = {
  ...emptyProfile,
  email:"",
};

export default function App() {
  // Shared state lives here so the pages stay simple. Refresh resets the demo.
  const [page, setPage] = useState('login');
  const [role, setRole] = useState('Job seeker');
  const [profile, setProfile] = useState({...intialProfile});
  const [resume, setResume] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // loading sample jobs (placeholder)
  useEffect(() => {
    loadJobs();  
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError('');
    try { 
      const results = await getJobs();
      setJobs(results);
     }
    catch { setError('Could not load jobs. Please retry.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadJobs(); }, []);

  function enter(name, selectedRole) {
    setProfile({ ...initialProfile, name });
    setResume(null);
    setRole(selectedRole);
    setMessage('');
    setPage(selectedRole === 'Recruiter' ? 'recruiter' : 'onboarding');
  }
  function navigate(nextPage) { setPage(nextPage); setMessage(''); }

  // Keep the selected File in memory.
  function changeResume(file) {
    setResume(file);

    setProfile((current) => ({
      ...current,
      resumeName: file ? file.name : "",
    }));
  }

  function saveJob(id) {
    setSaved((current) => {
      if (current.includes(id)) {
        return current;
      }

      return [...current, id];
    });

    setMessage("Job saved.");
  }

  function removeSavedJob(id) {
    setSaved((current) =>
      current.filter((savedId) => savedId !== id)
    );
  }

  function apply(job) {
    setApplications((current) => {
      const alreadyTracked = current.some(
        (application) => application.id === job.id
      );

      if (alreadyTracked) {
        return current;
      }

      return [
        ...current,
        {
          ...job,
          status: "Started",
        },
      ];
    });

    navigate("applications");

    setMessage(
      "Demo: this job is in your tracker. No application was submitted."
    );
  }

  function updateApplicationStatus(id, status) {
    setApplications((current) =>
      current.map((application) =>
        application.id === id
          ? { ...application, status }
          : application
      )
    );
  }

  function logout() {
    setProfile({ ...initialProfile });
    setResume(null);
    setSaved([]);
    setApplications([]);
    setMessage("");
    setRole("Job seeker");
    setPage("login");
  }

  // The login page does not show the main navigation.
  if (page === "login") {
    return <Login onEnter={enter} />;
  }

  const isJobPage = page === "discover" || page === "saved";

  return (
    <>
      <Navigation
        page={page}
        navigate={navigate}
        role={role}
        logout={logout}
      />

      <div className="container">
        <p className="demo-label">
          Student starter · fictional data · changes reset on refresh
        </p>

        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}

        {/* Initial setup after entering as a job seeker */}
        {page === "onboarding" && (
          <Onboarding
            profile={profile}
            setProfile={setProfile}
            finish={() => navigate("discover")}
          />
        )}

        {/* Manage profile and select or remove a resume */}
        {page === "profile" && (
          <Profile
            profile={profile}
            onSaveProfile={saveProfile}
            resume={resume}
            onResumeChange={changeResume}
          />
        )}

        {loading && isJobPage && (
          <p role="status">Loading jobs...</p>
        )}

        {error && isJobPage && (
          <div role="alert">
            <p>{error}</p>
            <button type="button" onClick={loadJobs}>
              Retry
            </button>
          </div>
        )}

        {/* Browse and save recommended jobs */}
        {!loading && !error && page === "discover" && (
          <Discover
            jobs={jobs}
            profile={profile}
            saved={saved}
            onSave={saveJob}
            onApply={apply}
          />
        )}

        {/* View and remove saved jobs */}
        {!loading && !error && page === "saved" && (
          <SavedJobs
            jobs={jobs}
            profile={profile}
            saved={saved}
            onRemove={removeSavedJob}
            onApply={apply}
          />
        )}

        {/* Track application statuses manually */}
        {page === "applications" && (
          <Applications
            applications={applications}
            updateStatus={updateApplicationStatus}
          />
        )}

        {/* Recruiter demo */}
        {page === "recruiter" && <Recruiter />}
      </div>
    </>
  );
}
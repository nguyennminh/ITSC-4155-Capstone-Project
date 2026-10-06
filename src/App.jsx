import React, { useEffect, useState } from "react";

import JobDetails from './pages/JobDetails.jsx';
import { getApplications, startApplication, changeApplicationStatus } from './services/applicationService.js';
import Navigation from "./components/Navigation.jsx";
import Login from "./pages/Login.jsx";
import ResumeWorkflow from "./pages/ResumeWorkflow.jsx";
import Discover from "./pages/Discover.jsx";
import SavedJobs from "./pages/SavedJobs.jsx";
import Applications from "./pages/Applications.jsx";
import Recruiter from "./pages/Recruiter.jsx";
import Profile from "./pages/Profile.jsx";

import { emptyProfile } from "./data/mockData.js";
import { getJobs } from "./services/jobService.js";
import { api, jsonPost } from "./services/resumeService.js";

const initialProfile = {
  ...emptyProfile,
  email: "",
};

export default function App() {
  // Navigation and user information
  const [page, setPage] = useState("login");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [role, setRole] = useState("Job seeker");
  const [profile, setProfile] = useState({ ...initialProfile });
  const [resume, setResume] = useState(null);
  const [profileConfirmed, setProfileConfirmed] = useState(false);

  // Jobs and application tracking
  const [jobs, setJobs] = useState([]);
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);

  const [recommendations, setRecommendations] = useState([]);
  const [matchSource, setMatchSource] = useState('deterministic');
  const [detail, setDetail] = useState(null);
  function receiveMatches(result) { setJobs(result.jobs); setRecommendations(result.matches); setMatchSource(result.source); }
  function openDetails(job, recommendation) { setDetail({job, recommendation}); }
  // Feedback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    setSessionLoading(true);
    setSessionError("");
    try {
      const { user } = await api('/api/auth/me');
      if (user) enter(user);
    } catch (err) { setSessionError(err.message); }
    finally { setSessionLoading(false); }
  }

  async function loadJobs() {
    setLoading(true);
    setError("");

    try {
      const results = await getJobs();
      setJobs(results);
    } catch {
      setError("Could not load jobs. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  function enter(user) {
    loadJobs();
    getApplications().then(result => setApplications(result.applications)).catch(err => setMessage(err.message));
    setDetail(null); setRecommendations([]);
    setProfile(user.profile);
    setProfileConfirmed(user.confirmed);
    setRole(user.role);
    setResume(null);
    setSaved([]);
    setApplications([]);
    setMessage("");
    setPage(user.role === "Recruiter" ? "recruiter" : user.confirmed ? "discover" : "onboarding");
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMessage("");
  }

  async function saveProfile(updatedProfile) {
    const { user } = await jsonPost('/api/profile/confirm', { confirmed: true, profile: updatedProfile });
    setProfile(user.profile);
    setProfileConfirmed(user.confirmed);
  }

  async function confirmResume(updatedProfile, file) {
    await saveProfile({ ...updatedProfile, resumeName: file?.name || updatedProfile.resumeName || "" });
    setResume(file);
    navigate(page === "onboarding" ? "discover" : "profile");
  }

  function saveJob(id) {
    setSaved((current) =>
      current.includes(id) ? current : [...current, id]
    );

    setMessage("Job saved.");
  }

  function removeSavedJob(id) {
    setSaved((current) =>
      current.filter((savedId) => savedId !== id)
    );
  }

  async function apply(job) {
    const result = await startApplication(job.id);
    setApplications(result.applications);
    return result;
  }
  async function updateApplicationStatus(id, status) {
    try { const result = await changeApplicationStatus(id, status); setApplications(result.applications); }
    catch(err) { setMessage(err.message); }
  }

  async function logout() {
    try { await jsonPost('/api/auth/logout', {}); }
    catch (err) { setMessage(err.message); return; }
    setProfile({ ...initialProfile });
    setResume(null);
    setProfileConfirmed(false);
    setSaved([]);
    setApplications([]);
    setMessage("");
    setDetail(null); setRecommendations([]); setJobs([]);
    setRole("Job seeker");
    setPage("login");
  }

  if (sessionLoading) return <main className="container"><p role="status">Loading your account…</p></main>;
  if (sessionError) return <main className="container"><p role="alert">{sessionError}</p><button onClick={restoreSession}>Retry connection</button></main>;
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

      {detail && <JobDetails {...detail} source={matchSource} onClose={() => setDetail(null)} onStart={apply}/>}
      <div className="container" inert={detail ? true : undefined}>
        <p className="demo-label"><a href="https://www.adzuna.com/" target="_blank" rel="noopener noreferrer">Jobs by Adzuna</a> ·
          Confirmed profiles and application tracking are saved
        </p>

        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}

        {["onboarding", "resume"].includes(page) && (
          <ResumeWorkflow
            key={page}
            profile={profile}
            resume={resume}
            onConfirm={confirmResume}
            onCancel={() => navigate(page === "onboarding" ? "discover" : "profile")}
          />
        )}

        {page === "profile" && (
          <Profile
            profile={profile}
            onSaveProfile={saveProfile}
            resume={resume}
            onReviewResume={() => navigate("resume")}
          />
        )}

        {loading && isJobPage && (
          <p role="status">Loading jobs...</p>
        )}

        {error && isJobPage && (
          <div className="notice" role="alert">
            <p>{error}</p>
            <button type="button" onClick={loadJobs}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && page === "discover" && (
          <Discover
            key={JSON.stringify(profile)}
            confirmed={profileConfirmed}
            onReview={() => navigate("resume")}
            jobs={jobs}
            profile={profile}
            saved={saved}
            onSave={saveJob}
            onApply={apply}
            onDetails={openDetails}
            source={matchSource}
            recommendations={recommendations}
            onResults={receiveMatches}
          />
        )}

        {!loading && !error && page === "saved" && (
          <SavedJobs
            jobs={jobs}
            profile={profile}
            saved={saved}
            onRemove={removeSavedJob}
            onApply={apply}
            onDetails={openDetails}
            source={matchSource}
            recommendations={recommendations}
            onResults={receiveMatches}
          />
        )}

        {page === "applications" && (
          <Applications
            applications={applications}
            updateStatus={updateApplicationStatus}
          />
        )}

        {page === "recruiter" && <Recruiter />}
      </div>
    </>
  );
}

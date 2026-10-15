import React, { useEffect, useRef, useState } from "react";

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
import { api, jsonPost, onSessionExpired } from "./services/resumeService.js";
import { getSavedJobs, removeSavedJob as deleteSavedJob, saveJob as persistSavedJob } from "./services/savedJobService.js";
import { deleteAccount } from "./services/resumeService.js";

const initialProfile = {
  ...emptyProfile,
  email: "",
};

export default function App() {
  // Navigation and user information
  const [page, setPage] = useState("login");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [role, setRole] = useState("Job seeker");
  const [profile, setProfile] = useState({ ...initialProfile });
  const [resume, setResume] = useState(null);
  const [profileConfirmed, setProfileConfirmed] = useState(false);

  // Jobs and application tracking
  const [jobs, setJobs] = useState([]);
  const [saved, setSaved] = useState([]);
  const [savedListings, setSavedListings] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");
  const [applications, setApplications] = useState([]);

  const [recommendations, setRecommendations] = useState([]);
  const [detail, setDetail] = useState(null);
  const detailTrigger = useRef(null);
  function receiveMatches(result) { setJobs(result.jobs); setRecommendations(result.matches); }
  function openDetails(job, recommendation) {
    detailTrigger.current = document.activeElement;
    setDetail({ job, recommendation });
  }
  function closeDetails() {
    setDetail(null);
    requestAnimationFrame(() => detailTrigger.current?.focus());
  }
  // Feedback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => resetAccount('Your session has expired. Please sign in again.'));
    restoreSession();
    return unsubscribe;
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

  async function loadJobs({ refresh = false } = {}) {
    setLoading(true);
    setError("");

    try {
      const results = await getJobs({ refresh });
      setJobs(results);
    } catch (err) {
      setError(err.message || "Could not load jobs. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  function refreshJobs() {
    setRecommendations([]);
    setDetail(null);
    return loadJobs({ refresh: true });
  }

  function enter(user) {
    getApplications().then(result => setApplications(result.applications)).catch(err => setMessage(err.message));
    loadSavedJobs();
    setDetail(null); setRecommendations([]);
    setProfile(user.profile);
    setProfileConfirmed(user.confirmed);
    setRole(user.role);
    setResume(null);
    setSaved([]);
    setSavedListings([]);
    setApplications([]);
    setMessage("");
    setLoginNotice("");
    if (user.confirmed && user.profile.skills.trim()) loadJobs();
    else { setJobs([]); setLoading(false); setError(""); }
    setPage(user.role === "Recruiter" ? "recruiter" : user.confirmed ? "discover" : "onboarding");
  }

  async function loadSavedJobs() {
    setSavedLoading(true);
    setSavedError("");
    try {
      const result = await getSavedJobs();
      setSavedListings(result.savedJobs);
      setSaved(result.savedJobs.map(job => job.id));
    } catch (err) {
      setSavedError(err.message);
    } finally {
      setSavedLoading(false);
    }
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMessage("");
  }

  async function saveProfile(updatedProfile) {
    const { user } = await jsonPost('/api/profile/confirm', { confirmed: true, profile: updatedProfile });
    setProfile(user.profile);
    setProfileConfirmed(user.confirmed);
    setRecommendations([]);
    setDetail(null);
    if (updatedProfile.skills.trim()) await loadJobs();
    else { setJobs([]); setLoading(false); setError(""); }
  }

  async function confirmResume(updatedProfile, file) {
    await saveProfile({ ...updatedProfile, resumeName: file?.name || updatedProfile.resumeName || "" });
    setResume(file);
    navigate(page === "onboarding" ? "discover" : "profile");
  }

  async function saveJob(job) {
    try {
      const result = await persistSavedJob(job.id);
      setSavedListings(result.savedJobs);
      setSaved(result.savedJobs.map(savedJob => savedJob.id));
      setMessage("Job saved.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function removeSavedJob(id) {
    try {
      const result = await deleteSavedJob(id);
      setSavedListings(result.savedJobs);
      setSaved(result.savedJobs.map(job => job.id));
    } catch (err) {
      setMessage(err.message);
    }
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
    if (logoutBusy) return;
    setLogoutBusy(true);
    try { await jsonPost('/api/auth/logout', {}); }
    catch (err) { setMessage(err.message); return; }
    finally { setLogoutBusy(false); }
    resetAccount();
  }

  function resetAccount(notice = "") {
    setProfile({ ...initialProfile });
    setResume(null);
    setProfileConfirmed(false);
    setSaved([]);
    setSavedListings([]);
    setApplications([]);
    setMessage("");
    setDetail(null); setRecommendations([]); setJobs([]);
    setRole("Job seeker");
    setSessionError("");
    setLoginNotice(notice);
    setPage("login");
  }

  async function removeAccount() {
    await deleteAccount();
    setProfile({ ...initialProfile }); setResume(null); setProfileConfirmed(false); setSaved([]);
    setApplications([]); setDetail(null); setRecommendations([]); setJobs([]); setRole("Job seeker"); setPage("login");
  }

  if (sessionLoading) return <main className="container"><p role="status">Loading your account…</p></main>;
  if (sessionError) return <main className="container"><p role="alert">{sessionError}</p><button onClick={restoreSession}>Retry connection</button></main>;
  if (page === "login") {
    return <Login onEnter={enter} notice={loginNotice} />;
  }

  const isJobPage = page === "discover";

  return (
    <>
      <Navigation
        page={page}
        navigate={navigate}
        role={role}
        logout={logout}
        logoutBusy={logoutBusy}
      />

      {detail && <JobDetails {...detail} onClose={closeDetails} onStart={apply}/>}
      <div className="container" inert={detail ? true : undefined}>
        <p className="demo-label"><a href="https://www.adzuna.com/" target="_blank" rel="noopener noreferrer">Jobs by Adzuna</a> ·
          Confirmed profiles, saved jobs, and application tracking are saved
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
            onSavedResumeRemoved={setProfile}
            onCancel={() => navigate(page === "onboarding" ? "discover" : "profile")}
          />
        )}

        {page === "profile" && (
          <Profile
            profile={profile}
            onSaveProfile={saveProfile}
            resume={resume}
            onReviewResume={() => navigate("resume")}
            onDeleteAccount={removeAccount}
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
            recommendations={recommendations}
            onResults={receiveMatches}
            onRefreshJobs={refreshJobs}
          />
        )}

        {page === "saved" && (
          <SavedJobs
            jobs={savedListings}
            profile={profile}
            saved={saved}
            loading={savedLoading}
            error={savedError}
            onRetry={loadSavedJobs}
            onRemove={removeSavedJob}
            onApply={apply}
            onDetails={openDetails}
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

import React, { useEffect, useRef, useState } from "react";

import JobDetails from './pages/JobDetails.jsx';

import {
  getApplications,
  startApplication,
  changeApplicationStatus,
  deleteApplication as deleteApplicationRequest
} from './services/applicationService.js';

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
import { api, getMatches, jsonPost, onSessionExpired } from "./services/resumeService.js";
import { getSavedJobs, removeSavedJob as deleteSavedJob, saveJob as persistSavedJob } from "./services/savedJobService.js";
import { deleteAccount } from "./services/resumeService.js";

const initialProfile = {
  ...emptyProfile,
  email: "",
};

export default function App() {
  const [page, setPage] = useState("login");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [accountId, setAccountId] = useState(null);
  const accountVersion = useRef(0);
  const [role, setRole] = useState("Job seeker");
  const [profile, setProfile] = useState({ ...initialProfile });
  const [resume, setResume] = useState(null);
  const [profileConfirmed, setProfileConfirmed] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [jobSource, setJobSource] = useState('');
  const [saved, setSaved] = useState([]);
  const [savedListings, setSavedListings] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");
  const [applications, setApplications] = useState([]);

  const [recommendations, setRecommendations] = useState([]);
  const [detail, setDetail] = useState(null);
  const detailTrigger = useRef(null);

  function openDetails(job, recommendation) {
    detailTrigger.current = document.activeElement;
    setDetail({ job, recommendation });
  }

  function closeDetails() {
    setDetail(null);
    requestAnimationFrame(() => detailTrigger.current?.focus());
  }

  const [loading, setLoading] = useState(false);
  const [matchNotice, setMatchNotice] = useState("");
  const [matchesReady, setMatchesReady] = useState(false);
  const matchingVersion = useRef(0);
  const matchingPending = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSessionExpired(() =>
      resetAccount('Your session has expired. Please sign in again.')
    );

    restoreSession();

    return unsubscribe;
  }, []);

  async function restoreSession() {
    setSessionLoading(true);
    setSessionError("");

    try {
      const { user } = await api('/api/auth/me');
      if (user) enter(user);
    } catch (err) {
      setSessionError(err.message);
    } finally {
      setSessionLoading(false);
    }
  }

  function clearMatching() {
    matchingVersion.current++;
    matchingPending.current = false;
    setJobs([]);
    setRecommendations([]);
    setMatchesReady(false);
    setLoading(false);
    setError("");
    setMatchNotice("");
    setDetail(null);
  }

  async function loadMatches({ refresh = false } = {}) {
    if (matchingPending.current) return;

    const version = accountVersion.current;
    const request = ++matchingVersion.current;
    const isCurrent = () =>
      version === accountVersion.current &&
      request === matchingVersion.current;

    matchingPending.current = true;
    setLoading(true);
    setError("");
    setMatchNotice("");
    setJobs([]);
    setRecommendations([]);
    setMatchesReady(false);
    setDetail(null);

    try {
      if (refresh) {
        await getJobs({ refresh: true });
        if (!isCurrent()) return;
      }

      const result = await getMatches();
      if (!isCurrent()) return;

      setJobs(result.jobs);
      setRecommendations(result.matches);
      setJobSource(result.jobSource || result.jobs[0]?.source || '');
      setMatchesReady(true);
      setMatchNotice(result.message || "");
    } catch (err) {
      if (isCurrent()) {
        setError(err.message || "Could not load matches. Please retry.");
      }
    } finally {
      if (isCurrent()) {
        matchingPending.current = false;
        setLoading(false);
      }
    }
  }

  function refreshJobs() {
    return loadMatches({ refresh: true });
  }

  function enter(user) {
    accountVersion.current++;
    setAccountId(user.id);

    const version = accountVersion.current;

    getApplications()
      .then(result => {
        if (version === accountVersion.current) {
          setApplications(result.applications);
        }
      })
      .catch(err => {
        if (version === accountVersion.current) {
          setMessage(err.message);
        }
      });

    loadSavedJobs();
    clearMatching();

    setProfile(user.profile);
    setProfileConfirmed(user.confirmed);
    setRole(user.role);
    setResume(null);
    setSaved([]);
    setSavedListings([]);
    setApplications([]);
    setMessage("");
    setLoginNotice("");

    if (
      user.role !== "Recruiter" &&
      user.confirmed &&
      user.profile.skills.trim()
    ) {
      loadMatches();
    }

    // New recruiters must complete their company profile first.
    // Returning confirmed recruiters go directly to their dashboard.
    if (user.role === "Recruiter") {
      setPage(user.confirmed ? "recruiter" : "profile");
    } else {
      setPage(user.confirmed ? "discover" : "onboarding");
    }
  }

  async function loadSavedJobs() {
    const version = accountVersion.current;

    setSavedLoading(true);
    setSavedError("");

    try {
      const result = await getSavedJobs();

      if (version !== accountVersion.current) return;

      setSavedListings(result.savedJobs);
      setSaved(result.savedJobs.map(job => job.id));
    } catch (err) {
      if (version === accountVersion.current) {
        setSavedError(err.message);
      }
    } finally {
      if (version === accountVersion.current) {
        setSavedLoading(false);
      }
    }
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMessage("");
  }

  async function saveProfile(updatedProfile) {
    const version = accountVersion.current;
    const firstRecruiterProfile = role === "Recruiter" && !profileConfirmed;

    const { user } = await jsonPost('/api/profile/confirm', {
      confirmed: true,
      profile: updatedProfile
    });

    if (version !== accountVersion.current) {
      throw new Error('Account changed. Sign in and retry.');
    }

    setProfile(user.profile);
    setProfileConfirmed(user.confirmed);
    clearMatching();

    if (
      role !== "Recruiter" &&
      user.confirmed &&
      user.profile.skills.trim()
    ) {
      loadMatches();
    }

    // Take a recruiter to the dashboard after their first successful save.
    if (firstRecruiterProfile) {
      setPage("recruiter");
    }
  }

  async function confirmResume(updatedProfile, file) {
    const version = accountVersion.current;

    await saveProfile({
      ...updatedProfile,
      resumeName: file?.name || updatedProfile.resumeName || ""
    });

    if (version !== accountVersion.current) return;

    setResume(file);
    navigate(page === "onboarding" ? "discover" : "profile");
  }

  async function saveJob(job) {
    const version = accountVersion.current;

    try {
      const result = await persistSavedJob(job.id);

      if (version !== accountVersion.current) return false;

      setSavedListings(result.savedJobs);
      setSaved(result.savedJobs.map(savedJob => savedJob.id));
      setMessage("Job saved.");

      return true;
    } catch (err) {
      if (version === accountVersion.current) {
        setMessage(err.message);
      }

      return false;
    }
  }

  async function removeSavedJob(id) {
    const version = accountVersion.current;

    try {
      const result = await deleteSavedJob(id);

      if (version !== accountVersion.current) return;

      setSavedListings(result.savedJobs);
      setSaved(result.savedJobs.map(job => job.id));
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function apply(job) {
    const version = accountVersion.current;
    const result = await startApplication(job.id);

    if (version !== accountVersion.current) {
      throw new Error('Account changed. Sign in and retry.');
    }

    setApplications(result.applications);
    return result;
  }

  async function updateApplicationStatus(id, status) {
    const version = accountVersion.current;

    try {
      const result = await changeApplicationStatus(id, status);

      if (version === accountVersion.current) {
        setApplications(result.applications);
      }
    } catch (err) {
      if (version === accountVersion.current) {
        setMessage(err.message);
      }
    }
  }

  async function handleDeleteApplication(jobId) {
    const version = accountVersion.current;
    const result = await deleteApplicationRequest(jobId);

    if (version !== accountVersion.current) return;

    setApplications(result.applications);
    setMessage("Application deleted successfully.");
  }

  async function logout() {
    if (logoutBusy) return;

    setLogoutBusy(true);

    try {
      await jsonPost('/api/auth/logout', {});
    } catch (err) {
      setMessage(err.message);
      return;
    } finally {
      setLogoutBusy(false);
    }

    resetAccount();
  }

  function resetAccount(notice = "") {
    accountVersion.current++;
    setAccountId(null);
    setProfile({ ...initialProfile });
    setResume(null);
    setProfileConfirmed(false);
    setSaved([]);
    setSavedListings([]);
    setApplications([]);
    setMessage("");
    clearMatching();
    setRole("Job seeker");
    setSessionError("");
    setLoginNotice(notice);
    setPage("login");
  }

  async function removeAccount() {
    await deleteAccount();
    resetAccount();
  }

  if (sessionLoading) {
    return (
      <main className="container">
        <p role="status">Loading your account…</p>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="container">
        <p role="alert">{sessionError}</p>
        <button onClick={restoreSession}>Retry connection</button>
      </main>
    );
  }

  if (page === "login") {
    return <Login onEnter={enter} notice={loginNotice} />;
  }

  return (
    <div className="app-layout">
      <Navigation
        page={page}
        navigate={navigate}
        role={role}
        logout={logout}
        logoutBusy={logoutBusy}
        profile={profile}
        savedCount={saved.length}
        inert={detail ? true : undefined}
      />

      {detail && (
        <JobDetails
          {...detail}
          onClose={closeDetails}
          onStart={apply}
        />
      )}

      <div className="container" inert={detail ? true : undefined}>
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
            onCancel={() =>
              navigate(page === "onboarding" ? "discover" : "profile")
            }
          />
        )}

        {page === "profile" && (
          <Profile
            profile={profile}
            onSaveProfile={saveProfile}
            resume={resume}
            onReviewResume={() => navigate("resume")}
            onDeleteAccount={removeAccount}
            role={role}
          />
        )}

        {page === "discover" && (
          <Discover
            key={`${accountId}:${JSON.stringify(profile)}`}
            accountId={accountId}
            confirmed={profileConfirmed}
            onReview={() => navigate("resume")}
            jobs={jobs}
            profile={profile}
            saved={saved}
            jobSource={jobSource}
            started={applications.map(application => String(application.id))}
            onSave={saveJob}
            onApply={apply}
            onDetails={openDetails}
            recommendations={recommendations}
            loading={loading}
            matchingError={error}
            notice={matchNotice}
            matchesReady={matchesReady}
            onRetry={() => loadMatches()}
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
          />
        )}

        {page === "applications" && (
          <Applications
            applications={applications}
            updateStatus={updateApplicationStatus}
            deleteApplication={handleDeleteApplication}
          />
        )}

        {page === "recruiter" && <Recruiter profile={profile} />}

        <p className="demo-label">
          {jobSource === 'Greenhouse' && <>Listings from Greenhouse · </>}
          {jobSource === 'Adzuna' && (
            <>
              <a
                href="https://www.adzuna.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Jobs by Adzuna
              </a>
              {' · '}
            </>
          )}
          Confirmed profiles, saved jobs, and application tracking are saved
        </p>
      </div>
    </div>
  );
}
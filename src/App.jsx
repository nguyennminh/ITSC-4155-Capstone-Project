import React, { useEffect, useState } from "react";

import Navigation from "./components/Navigation.jsx";
import Login from "./pages/Login.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Discover from "./pages/Discover.jsx";
import SavedJobs from "./pages/SavedJobs.jsx";
import Applications from "./pages/Applications.jsx";
import Recruiter from "./pages/Recruiter.jsx";
import Profile from "./pages/Profile.jsx";

import { emptyProfile } from "./data/mockData.js";
import { getJobs } from "./services/jobService.js";

const initialProfile = {
  ...emptyProfile,
  email: "",
};

export default function App() {
  // Navigation and user information
  const [page, setPage] = useState("login");
  const [role, setRole] = useState("Job seeker");
  const [profile, setProfile] = useState({ ...initialProfile });
  const [resume, setResume] = useState(null);

  // Jobs and application tracking
  const [jobs, setJobs] = useState([]);
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);

  // Feedback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadJobs();
  }, []);

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

  function enter(name, selectedRole) {
    setProfile({
      ...initialProfile,
      name,
    });

    setResume(null);
    setSaved([]);
    setApplications([]);
    setRole(selectedRole);
    setMessage("");

    setPage(
      selectedRole === "Recruiter" ? "recruiter" : "onboarding"
    );
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMessage("");
  }

  function saveProfile(updatedProfile) {
    setProfile((current) => ({
      ...current,
      ...updatedProfile,
      resumeName: current.resumeName,
    }));
  }

  function changeResume(file) {
    setResume(file);

    setProfile((current) => ({
      ...current,
      resumeName: file ? file.name : "",
    }));
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

  function apply(job) {
    setApplications((current) => {
      const alreadyTracked = current.some(
        (application) => application.id === job.id
      );

      if (alreadyTracked) {
        return current;
      }

      return [...current, { ...job, status: "Started" }];
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

        {page === "onboarding" && (
          <Onboarding
            profile={profile}
            setProfile={setProfile}
            finish={() => navigate("discover")}
          />
        )}

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
          <div className="notice" role="alert">
            <p>{error}</p>
            <button type="button" onClick={loadJobs}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && page === "discover" && (
          <Discover
            jobs={jobs}
            profile={profile}
            saved={saved}
            onSave={saveJob}
            onApply={apply}
          />
        )}

        {!loading && !error && page === "saved" && (
          <SavedJobs
            jobs={jobs}
            profile={profile}
            saved={saved}
            onRemove={removeSavedJob}
            onApply={apply}
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
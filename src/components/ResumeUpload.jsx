import React, { useRef, useState } from "react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function ResumeUpload({ resume, onResumeChange }) {
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function handleFileChange(event) {
    const file = event.target.files[0];

    // Reset so selecting the same file again triggers a change.
    event.target.value = "";

    if (!file) return;

    const extension = file.name.split(".").pop().toLowerCase();

    if (!["pdf", "docx"].includes(extension)) {
      setError("Please select a PDF or DOCX file.");
      return;
    }

    if (file.size === 0) {
      setError("This file is empty. Please select another file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Your resume must be 10 MB or smaller.");
      return;
    }

    setError("");
    onResumeChange(file);
  }

  function removeResume() {
    onResumeChange(null);
    setError("");
  }

  return (
    <section className="profile-panel" aria-labelledby="resume-heading">
      <h2 id="resume-heading">Resume</h2>

      <p id="resume-help">
        Select a PDF or DOCX file, up to 10 MB.
        This demo keeps the file only until the page refreshes.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileChange}
        aria-label="Select your resume"
        aria-describedby="resume-help resume-error"
        hidden
      />

      <div className="profile-actions">
        <button
          type="button"
          onClick={() => inputRef.current.click()}
        >
          {resume ? "Replace resume" : "Select resume"}
        </button>

        {resume && (
          <button
            type="button"
            className="secondary-button"
            onClick={removeResume}
          >
            Remove resume
          </button>
        )}
      </div>

      {resume && (
        <div className="resume-details" role="status">
          <strong>{resume.name}</strong>
          <span>{(resume.size / 1024).toFixed(1)} KB</span>
          <p>Selected locally. Not uploaded to a server.</p>
        </div>
      )}

      <p id="resume-error" className="profile-error" role="alert">
        {error}
      </p>
    </section>
  );
}
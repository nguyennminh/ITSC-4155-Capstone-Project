import { useState } from "react";
import ResumeUpload from "../components/ResumeUpload";

export default function Profile({
  profile,
  onSaveProfile,
  resume,
  onResumeChange,
}) {
  const [form, setForm] = useState({ ...profile });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setMessage("");
    setError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Please enter your name.");
      return;
    }

    const updatedProfile = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      location: form.location.trim(),
      title: form.title.trim(),
      skills: form.skills.trim(),
      education: form.education.trim(),
      experience: form.experience.trim(),
      certifications: form.certifications.trim(),
    };

    onSaveProfile(updatedProfile);
    setForm(updatedProfile);
    setError("");
    setMessage("Profile saved for this session.");
  }

  function cancelChanges() {
    setForm({ ...profile });
    setError("");
    setMessage("Unsaved profile changes discarded.");
  }

  return (
    <main className="profile-page">
      <h1>Manage your profile</h1>
      <p>
        Update your information and job preferences.
        Changes reset when you refresh this demo.
      </p>

      <ResumeUpload
        resume={resume}
        onResumeChange={onResumeChange}
      />

      <form className="profile-panel" onSubmit={handleSubmit}>
        <h2>Personal information</h2>

        <div className="profile-grid">
          <label>
            Full name *
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
              maxLength={100}
              required
            />
          </label>

          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              maxLength={254}
            />
          </label>

          <label>
            Location
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              placeholder="Charlotte, NC"
            />
          </label>

          <label>
            Desired job title
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Software Engineer"
            />
          </label>
        </div>

        <h2>Qualifications</h2>

        <label>
          Skills
          <input
            name="skills"
            value={form.skills}
            onChange={handleChange}
            placeholder="JavaScript, React, Python, SQL"
            aria-describedby="skills-help"
          />
        </label>
        <small id="skills-help">Separate each skill with a comma.</small>

        <label>
          Education
          <textarea
            name="education"
            value={form.education}
            onChange={handleChange}
            rows={3}
            placeholder="Degree, university, and expected graduation date"
          />
        </label>

        <label>
          Experience and projects
          <textarea
            name="experience"
            value={form.experience}
            onChange={handleChange}
            rows={5}
            placeholder="Internships, jobs, coursework, and projects"
          />
        </label>

        <label>
          Certifications
          <textarea
            name="certifications"
            value={form.certifications}
            onChange={handleChange}
            rows={2}
            placeholder="List any relevant certifications"
          />
        </label>

        <h2>Job preferences</h2>

        <div className="profile-grid">
          <label>
            Work arrangement
            <select
              name="mode"
              value={form.mode}
              onChange={handleChange}
            >
              <option value="Any">Any</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
              <option value="On-site">On-site</option>
            </select>
          </label>

          <label>
            Employment type
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
            >
              <option value="Any">Any</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Internship">Internship</option>
              <option value="Contract">Contract</option>
            </select>
          </label>
        </div>

        <p className="profile-error" role="alert">{error}</p>
        <p className="profile-success" role="status">{message}</p>

        <div className="profile-actions">
          <button type="submit">Save changes</button>

          <button
            type="button"
            className="secondary-button"
            onClick={cancelChanges}
          >
            Cancel changes
          </button>
        </div>
      </form>
    </main>
  );
}
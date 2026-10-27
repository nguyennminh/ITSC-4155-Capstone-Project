import React, { useState } from "react";
import ResumeEntryEditor from "../components/ResumeEntryEditor.jsx";
import { normalizeProfile, entryText } from "../data/profileFields.js";


export default function Profile({
  profile,
  onSaveProfile,
  resume,
  onReviewResume,
  onDeleteAccount,
}) {
  const [form, setForm] = useState(() => normalizeProfile(profile));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setMessage("");
    setError("");
  }

  function changeEntries(field, entries) {
    setForm(previous => ({ ...previous, [field]: entries,
      [field === 'experienceEntries' ? 'experience' : 'projects']: entryText(entries) }));
    setMessage(''); setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Please enter your name.");
      return;
    }

    const updatedProfile = {
      ...form,
      name: form.name.trim(),
      email: (form.email || "").trim(),
      phone: form.phone.trim(),
      projects: form.projects.trim(),
      location: form.location.trim(),
      title: form.title.trim(),
      skills: form.skills.trim(),
      education: form.education.trim(),
      experience: form.experience.trim(),
      certifications: form.certifications.trim(),
    };

    setBusy(true);
    try {
      await onSaveProfile(updatedProfile);
      setForm(updatedProfile);
      setError("");
      setMessage("Confirmed profile saved to your account.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function cancelChanges() {
    setForm(normalizeProfile(profile));
    setError("");
    setMessage("Unsaved profile changes discarded.");
  }

  async function handleDelete() {
    if (!window.confirm("This permanently deletes your account, saved jobs, applications, and resume data. Continue?")) return;
    setDeleting(true); setError("");
    try { await onDeleteAccount(); }
    catch (err) { setError(err.message); setDeleting(false); }
  }

  return (
    <main className="profile-page">
      <h1>Manage your profile</h1>
      <p>
        Update your information and job preferences.
        Saved information stays with your account when you return.
      </p>

      <p>Resume: {profile.resumeName || "No resume parsed yet"}</p>

      <p className="notice">To extract a new resume or confirm your information for matching, use the review flow. Save any edits below before leaving this page.</p>
      <button type="button" onClick={onReviewResume}>Parse / review resume information</button>

      <form className="profile-panel" onSubmit={handleSubmit} aria-busy={busy}>
        <p className="muted">Contact details do not change your sign-in email. Save your edits before requesting new job matches.</p>
        <h2>Personal information</h2>

        <div className="profile-grid">
          <label>
            Full name *
            <input disabled={busy}
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
            <input disabled={busy}
              type="email"
              name="email"
              value={form.email || ""}
              onChange={handleChange}
              autoComplete="email"
              maxLength={254}
            />
          </label>

          <label>Phone<input disabled={busy} type="tel" name="phone" value={form.phone} maxLength={40} onChange={handleChange}/></label>
          <label>
            Location
            <input disabled={busy}
              name="location"
              maxLength={200}
              value={form.location}
              onChange={handleChange}
              placeholder="Charlotte, NC"
            />
          </label>

          <label>
            Desired job title
            <input disabled={busy}
              name="title"
              maxLength={200}
              value={form.title}
              onChange={handleChange}
              placeholder="Software Engineer"
            />
          </label>
        </div>

        <h2>Qualifications</h2>

        <label>
          Skills
          <input disabled={busy}
            name="skills"
              maxLength={12000}
            value={form.skills}
            onChange={handleChange}
            placeholder="JavaScript, React, Python, SQL"
            aria-describedby="skills-help"
          />
        </label>
        <small id="skills-help">Separate each skill with a comma.</small>

        <label>
          Education
          <textarea disabled={busy}
            name="education"
              maxLength={12000}
            value={form.education}
            onChange={handleChange}
            rows={3}
            placeholder="Degree, university, and expected graduation date"
          />
        </label>

        {!form.experienceEntries.length && form.experience && <label>Existing experience text
          <textarea name="experience" rows={5} value={form.experience} maxLength={12000} onChange={handleChange}/>
        </label>}
        <ResumeEntryEditor label="Experience" entries={form.experienceEntries} disabled={busy} onChange={entries => changeEntries('experienceEntries', entries)}/>
        {!form.projectEntries.length && form.projects && <label>Existing projects text
          <textarea name="projects" rows={4} value={form.projects} maxLength={12000} onChange={handleChange}/>
        </label>}
        <ResumeEntryEditor label="Projects" entries={form.projectEntries} disabled={busy} onChange={entries => changeEntries('projectEntries', entries)}/>

        <label>
          Certifications
          <textarea disabled={busy}
            name="certifications"
              maxLength={12000}
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
            <select disabled={busy}
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
            <select disabled={busy}
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

        <p>By saving, you confirm these fields are accurate and can be used for future matching.</p>
        <div className="profile-actions">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save and confirm changes"}</button>

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={cancelChanges}
          >
            Cancel changes
          </button>
        </div>
      </form>
      <section className="profile-panel danger-zone" aria-labelledby="delete-account-heading">
        <h2 id="delete-account-heading">Delete account</h2>
        <p>Permanently delete your profile, saved jobs, applications, resume data, and active sessions.</p>
        <button type="button" className="secondary-button" disabled={deleting} onClick={handleDelete}>
          {deleting ? "Deleting account…" : "Delete my account"}
        </button>
      </section>
    </main>
  );
}
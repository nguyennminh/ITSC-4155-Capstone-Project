import React, { useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import ResumeEntryEditor from "../components/ResumeEntryEditor.jsx";
import { normalizeProfile, entryText } from "../data/profileFields.js";
import { useDropzone } from "react-dropzone";


export default function Profile({
  profile,
  onSaveProfile,
  resume,
  onReviewResume,
  onDeleteAccount,
  role,
}) {
  const [form, setForm] = useState(() => normalizeProfile(profile));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState(false);

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
    if (role === "Recruiter" && !form.companyName.trim()) {
      setError("Please enter your company name.");
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
      companyName: form.companyName.trim(),
      companyDescription: form.companyDescription.trim(),
      companyWebsite: form.companyWebsite.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
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

  function readImage(event, field) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setError("Choose an image file smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(previous => ({ ...previous, [field]: String(reader.result) }));
    reader.onerror = () => setError("The image could not be read. Please try again.");
    reader.readAsDataURL(file);
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
      <PageHeader title={role === "Recruiter" ? "Recruiter profile" : "Preferences"} subtitle={role === "Recruiter" ? "Represent yourself and your company professionally." : "Update your information and job preferences."}/>
      <p>Saved information stays with your account when you return.</p>

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

        {role === "Recruiter" && <section className="recruiter-profile-fields" aria-labelledby="company-profile-heading">
          <h2 id="company-profile-heading">Company profile</h2>
          <div className="profile-grid">
            <label>Company name *
              <input disabled={busy} name="companyName" value={form.companyName} maxLength={200} onChange={handleChange} required />
            </label>
            <label>Company website
              <input disabled={busy} type="url" name="companyWebsite" value={form.companyWebsite} maxLength={500} onChange={handleChange} placeholder="https://example.com" />
            </label>
            <label>Contact email
              <input disabled={busy} type="email" name="contactEmail" value={form.contactEmail} maxLength={254} onChange={handleChange} />
            </label>
            <label>Contact phone
              <input disabled={busy} type="tel" name="contactPhone" value={form.contactPhone} maxLength={40} onChange={handleChange} />
            </label>
          </div>
          <label>Company description
            <textarea disabled={busy} name="companyDescription" value={form.companyDescription} maxLength={12000} rows={4} onChange={handleChange} placeholder="Tell job seekers what your company does and why they should join." />
          </label>
          <div className="profile-grid image-upload-grid">
            <label>Profile picture
              <input disabled={busy} type="file" accept="image/*" onChange={event => readImage(event, "profileImage")} />
            </label>
            <label>Company logo
              <input disabled={busy} type="file" accept="image/*" onChange={event => readImage(event, "companyLogo")} />
            </label>
          </div>
          <div className="recruiter-preview-actions">
            <button type="button" className="secondary-button" onClick={() => setPreview(value => !value)}>{preview ? "Hide preview" : "Preview profile"}</button>
          </div>
          {preview && <article className="card recruiter-preview">
            <div className="recruiter-preview-brand">{form.profileImage && <img src={form.profileImage} alt="" />}{form.companyLogo && <img src={form.companyLogo} alt={`${form.companyName || "Company"} logo`} />}</div>
            <h2>{form.name || "Your name"}</h2><p>{form.title || "Professional title"}{form.companyName && ` · ${form.companyName}`}</p>
            <p>{form.companyDescription || "Your company description will appear here."}</p>
            {form.companyWebsite && <a href={form.companyWebsite} target="_blank" rel="noopener noreferrer">{form.companyWebsite}</a>}
          </article>}
        </section>}

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
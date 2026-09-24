import React, { useState } from 'react';

export default function ReviewResume({ initialProfile, rawText = '', warnings = [], onConfirm, onBack }) {
  const [form, setForm] = useState({ ...initialProfile });
  const [confirmed, setConfirmed] = useState(false);
  function update(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
    setConfirmed(false);
  }
  function submit(event) {
    event.preventDefault();
    if (!confirmed || !form.name.trim()) return;
    const trimmed = Object.fromEntries(Object.entries(form).map(([key, value]) =>
      [key, typeof value === 'string' ? value.trim() : value]));
    onConfirm(trimmed);
  }
  return <section>
    <h1>Review your resume information</h1>
    <p>Correct missing or inaccurate details. Only confirmed fields will be used for matching.</p>
    {warnings.map((warning, index) => <p className="notice" key={index}>{warning}</p>)}
    <div className="two-columns">
      <form className="card" onSubmit={submit}>
        <label>Full name<input required name="name" value={form.name} onChange={update} maxLength={100}/></label>
        <label>Email<input type="email" name="email" value={form.email || ''} onChange={update}/></label>
        <label>Skills (comma-separated)<textarea name="skills" value={form.skills} onChange={update} maxLength={12000}/></label>
        <label>Experience and projects<textarea name="experience" rows={7} value={form.experience} onChange={update} maxLength={12000}/></label>
        <label>Education<textarea name="education" rows={3} value={form.education} onChange={update} maxLength={12000}/></label>
        <label>Certifications<textarea name="certifications" value={form.certifications} onChange={update} maxLength={12000}/></label>
        <label>Preferred job title<input name="title" value={form.title} onChange={update} maxLength={200}/></label>
        <label>Preferred location<input name="location" value={form.location} onChange={update} maxLength={200}/></label>
        <label>Work arrangement<select name="mode" value={form.mode} onChange={update}>
          {['Any', 'Remote', 'Hybrid', 'On-site'].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Employment type<select name="type" value={form.type} onChange={update}>
          {['Any', 'Full-time', 'Part-time', 'Internship', 'Contract'].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
          I reviewed these fields and want to use them for matching.
        </label>
        <div className="actions">
          <button type="button" onClick={onBack}>Back</button>
          <button className="primary" disabled={!confirmed || !form.name.trim()}>Confirm information</button>
        </div>
      </form>
      <aside className="card">
        <h2>Extracted text</h2>
        <p className="muted">Compare the fields with this text. File extraction is local to the API server; no AI is used in this step.</p>
        <pre className="resume-text">{rawText || 'Manual entry: refer to your original resume.'}</pre>
      </aside>
    </div>
  </section>;
}

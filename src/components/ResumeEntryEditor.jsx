import React from 'react';

export default function ResumeEntryEditor({ label, entries = [], onChange, disabled = false }) {
  function update(index, name, value) {
    onChange(entries.map((entry, i) => i === index ? { ...entry, [name]: value } : entry));
  }
  return <section className="entry-editor" aria-label={label}>
    <h2>{label}</h2>
    {entries.map((entry, index) => <fieldset className="resume-entry" key={index} disabled={disabled}>
      <legend>{label} {index + 1}</legend>
      <label>Title<input value={entry.title || ''} maxLength={200} onChange={e => update(index, 'title', e.target.value)}/></label>
      <label>Organization<input value={entry.organization || ''} maxLength={200} onChange={e => update(index, 'organization', e.target.value)}/></label>
      <label>Dates<input value={entry.dates || ''} maxLength={100} onChange={e => update(index, 'dates', e.target.value)}/></label>
      <label>Description / bullets (one per line)<textarea rows={4} maxLength={6000} value={(entry.bullets || []).join('\n')} onChange={e => update(index, 'bullets', e.target.value.split('\n'))}/></label>
      <button type="button" className="secondary-button" onClick={() => onChange(entries.filter((_, i) => i !== index))}>Remove {label.toLowerCase()} {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={disabled || entries.length >= 20} onClick={() => onChange([...entries, { title: '', organization: '', dates: '', bullets: [] }])}>Add {label.toLowerCase()}</button>
  </section>;
}

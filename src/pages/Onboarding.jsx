import React, { useState } from 'react';

export default function Onboarding({ profile, setProfile, finish, editing = false }) {
  const [step, setStep] = useState(editing ? 2 : 1);
  const [error, setError] = useState('');
  function update(event) {
    setProfile({ ...profile, [event.target.name]: event.target.value });
  }
  function chooseFile(file) {
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      setError('Choose a PDF or DOCX smaller than 10 MB.'); return;
    }
    setError('');
    setProfile({ ...profile, resumeName: file.name });
  }
  return <section>
    <h1>{editing ? 'Your profile' : 'Set up your profile'}</h1>
    <p className="muted">Step {step} of 3 · Upload, review, preferences</p>
    {step === 1 && <div className="card">
      <h2>Choose your resume</h2>
      <p>No file is uploaded or parsed in this starter. Only its name is kept in memory.</p>
      <label className="dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}>
        Drop a PDF or DOCX, or browse (maximum 10 MB)
        <input type="file" accept=".pdf,.docx" onChange={event => chooseFile(event.target.files[0])}/>
      </label>
      {profile.resumeName && <p>Selected: {profile.resumeName}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="actions"><button className="primary" disabled={!profile.resumeName} onClick={() => setStep(2)}>Continue</button><button onClick={() => setStep(2)}>Enter details manually</button></div>
    </div>}
    {step === 2 && <div className="two-columns"><div className="card">
      <h2>Review resume details</h2>
      <p>Enter details manually until your team connects the parser.</p>
      {['name', 'skills', 'experience', 'education', 'certifications'].map(field => <label key={field}>{field === 'skills' ? 'Skills (comma-separated)' : field}
        <textarea name={field} value={profile[field]} onChange={update} rows={field === 'experience' ? 3 : 2}/>
      </label>)}
      <div className="actions"><button onClick={() => setStep(1)}>Back</button><button className="primary" onClick={() => setStep(3)}>Continue</button></div>
    </div><aside className="card"><h2>Resume checklist</h2><p>This is rule-based feedback, not AI analysis.</p>
      <ul>{['skills', 'experience', 'education'].map(field => <li key={field}>{profile[field].trim() ? 'Added: ' : 'Still needed: '}{field}</li>)}</ul>
      <p>Include measurable results and specific project contributions.</p>
    </aside></div>}
    {step === 3 && <form className="card" onSubmit={event => { event.preventDefault(); finish(); }}>
      <h2>Job preferences</h2>
      <label>Preferred job title<input name="title" value={profile.title} onChange={update}/></label>
      <label>Preferred location<input name="location" value={profile.location} onChange={update}/></label>
      <label>Work arrangement<select name="mode" value={profile.mode} onChange={update}>{['Any','Remote','Hybrid','On-site'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Employment type<select name="type" value={profile.type} onChange={update}>{['Any','Full-time','Internship'].map(x => <option key={x}>{x}</option>)}</select></label>
      <p className="muted">Arrangement and employment type filter the demo. Title and location are saved for future API search integration.</p>
      <div className="actions"><button type="button" onClick={() => setStep(2)}>Back</button><button className="primary">{editing ? 'Save and discover jobs' : 'Start discovering'}</button></div>
    </form>}
  </section>;
}


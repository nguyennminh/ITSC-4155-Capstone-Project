import React, { useEffect, useRef, useState } from 'react';
import ResumeUpload from '../components/ResumeUpload.jsx';
import ReviewResume from './ReviewResume.jsx';
import { api, parseResume } from '../services/resumeService.js';

export default function ResumeWorkflow({ profile, resume, onConfirm, onCancel }) {
  const [file, setFile] = useState(resume);
  const [result, setResult] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  useEffect(() => {
    const request = new AbortController();
    api('/api/resumes/latest', { signal: request.signal }).then(data => setDraft(data.draft)).catch(err => {
      if (!request.signal.aborted) setError(err.message);
    });
    return () => { request.abort(); controller.current?.abort(); };
  }, []);

  function changeFile(nextFile) {
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setFile(nextFile);
    setResult(null);
    setError('');
  }
  async function parse() {
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    try {
      const parsed = await parseResume(file, request.signal);
      if (!request.signal.aborted) setResult(parsed);
    } catch (err) {
      if (!request.signal.aborted) setError(err.message);
    } finally {
      if (controller.current === request) setLoading(false);
    }
  }
  if (result) return <ReviewResume
    initialProfile={{ ...profile, ...result.fields, resumeName: result.resumeName || profile.resumeName }}
    rawText={result.rawText} warnings={result.warnings}
    onBack={() => setResult(null)}
    onConfirm={updated => onConfirm(updated, file)}
  />;
  return <section>
    <h1>Upload and parse your resume</h1>
    <p>Choose a PDF or DOCX, extract its text, then review the fields before saving.</p>
    {draft && <p className="notice">An unfinished parsed resume is saved to your account: {draft.resumeName}. <button onClick={() => setResult(draft)}>Resume saved review</button></p>}
    <ResumeUpload resume={file} onResumeChange={changeFile}/>
    <p className="muted">Parsing sends the file to your local JobSwipe API. The original file is processed in memory; extracted text is saved privately to your account for review. Scanned PDFs are not supported.</p>
    <div className="actions">
      <button className="primary" disabled={!file || loading} onClick={parse}>{loading ? 'Parsing…' : 'Parse resume'}</button>
      <button disabled={loading} onClick={() => setResult({ fields: {}, rawText: '', warnings: [] })}>Enter details manually</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
    {loading && <p role="status">Reading your resume. This can take a few seconds.</p>}
    {error && <p className="profile-error" role="alert">{error}</p>}
  </section>;
}

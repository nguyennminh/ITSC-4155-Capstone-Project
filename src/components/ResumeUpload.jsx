import React, { useEffect, useRef, useState } from 'react';
import DropzoneUploader from './DropzoneUploader.jsx';

export default function ResumeUpload({ resume, savedResume, onResumeChange, onRemoveSaved, children }) {
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const uploaderRef = useRef(null);
  const currentResume = resume || savedResume;
  const isPdf = /\.pdf$/i.test(currentResume?.name || '');

  useEffect(() => {
    if (!currentResume) return;
    const controller = new AbortController();
    let url;
    async function loadPreview() {
      try {
        let blob = resume;
        if (!resume && isPdf) {
          const response = await fetch('/api/resumes/file', {
            credentials: 'same-origin', signal: controller.signal,
          });
          if (!response.ok) throw new Error('Preview unavailable');
          blob = await response.blob();
        }
        if (controller.signal.aborted) return;
        if (blob) {
          // Some local files have no MIME type; PDF viewers need the correct type.
          url = URL.createObjectURL(isPdf ? new Blob([blob], { type: 'application/pdf' }) : blob);
        }
        setPreview({ source: currentResume, url });
      } catch {
        if (!controller.signal.aborted) setPreview({ source: currentResume, failed: true });
      }
    }
    loadPreview();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [currentResume, resume, isPdf]);

  const activePreview = preview?.source === currentResume ? preview : null;

  function removeResume() {
    onResumeChange(null);
    setError('');
  }

  return (
    <section className="profile-panel" aria-labelledby="resume-heading">
      <h2 id="resume-heading">Resume</h2>
      <p id="resume-help">
        Select a PDF or DOCX file, up to 10 MB.
        Uploaded resumes are saved privately to your account.
      </p>

      <DropzoneUploader ref={uploaderRef} visible={!currentResume}
        onFileAccepted={onResumeChange} onError={setError} />

      {currentResume && (
        <div className="resume-details">
          <div role="status">
            <strong>{currentResume.name}</strong>
            <span>{(currentResume.size / 1024).toFixed(1)} KB{!resume && ' · Saved to your account'}</span>
          </div>
          {resume && <p>Selected on this device. It will be saved to your account when parsed.</p>}
          {isPdf && activePreview?.url && (
            <iframe className="resume-preview" title="Resume PDF preview" src={activePreview.url} />
          )}
          {isPdf && !activePreview && <p role="status">Loading resume preview…</p>}
          {activePreview?.failed && <p role="status">Could not load the preview. You can download or replace your resume.</p>}
          {!isPdf && <p>Download your DOCX resume to view it.</p>}
          {(!resume || activePreview?.url) && (
            <p><a href={resume ? activePreview.url : '/api/resumes/file'} download={currentResume.name}>
              {resume ? 'Download resume' : 'Download saved resume'}
            </a></p>
          )}
        </div>
      )}

      <div className="profile-actions">
        {currentResume && <button type="button" onClick={() => uploaderRef.current.open()}>Replace resume</button>}
        {resume && <button type="button" className="secondary-button" onClick={removeResume}>Remove resume</button>}
        {savedResume && <button type="button" className="secondary-button" onClick={onRemoveSaved}>Delete saved resume</button>}
      </div>
      <p id="resume-error" className="profile-error" role="alert">{error}</p>
      {children && (
        <div className="resume-alternative">
          <div className="resume-divider">or</div>
          {children}
        </div>
      )}
    </section>
  );
}

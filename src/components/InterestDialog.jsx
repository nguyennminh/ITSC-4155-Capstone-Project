import React, { useEffect, useRef } from 'react';
import { safeExternalUrl } from '../services/linkService.js';

export default function InterestDialog({ job, onClose }) {
  const dialog = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    close.current.focus();
    return () => { previous?.focus(); };
  }, []);
  const url = safeExternalUrl(job.postingUrl || job.applyUrl);
  return <dialog ref={dialog} className="interest-dialog" aria-labelledby="interest-title" onCancel={onClose} onClose={onClose}>
    <h2 id="interest-title">Job saved!</h2>
    <p><strong>{job.title}</strong> at {job.company} has been saved so you can come back to it.</p>
    <p>Automatic applications are coming soon. This is a preview of that step; no application has been submitted.</p>
    <p>For now, you can review the original posting and apply on the employer’s website.</p>
    <div className="actions">
      <button ref={close} className="primary" onClick={onClose}>Keep exploring</button>
      {url && <a href={url} target="_blank" rel="noopener noreferrer">View original posting ↗</a>}
    </div>
  </dialog>;
}

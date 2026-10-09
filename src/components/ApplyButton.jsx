import React, { useState } from 'react';
import { safeExternalUrl } from '../services/linkService.js';
export default function ApplyButton({ job, onStart }) {
  const [ready,setReady] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(''), [url,setUrl] = useState('');
  async function start() {
    setError('');
    if (!safeExternalUrl(job.applyUrl || job.postingUrl)) { setError('No valid application link is available for this job.'); return; }
    setBusy(true);
    try { const result = await onStart(job); setUrl(safeExternalUrl(result.url)); }
    catch(err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="apply-control">
    <button className="primary" onClick={() => setReady(!ready)}>Apply</button>
    {ready && <div><p>You will complete the application on an external website. JobSwipe does not submit it for you.</p>
      {!url ? <button disabled={busy} onClick={start}>{busy ? 'Recording…' : 'Start application'}</button> : <><p>Recorded as Started. Select the link to continue:</p><a href={url} target="_blank" rel="noopener noreferrer">Continue to application ↗</a></>}
    </div>}{error && <p role="alert">{error}</p>}
  </div>;
}

import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { safeExternalUrl } from '../services/linkService.js';
export default function ApplyButton({ job, onStart, variant = 'default', disabled = false }) {
  const [ready,setReady] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(''), [url,setUrl] = useState('');
  async function start() {
    setError('');
    if (!safeExternalUrl(job.applyUrl || job.postingUrl)) { setError('No valid application link is available for this job.'); return; }
    setBusy(true);
    try { const result = await onStart(job); setUrl(safeExternalUrl(result.url)); }
    catch(err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className={`apply-control${variant === 'circle' ? ' apply-control-circle' : ''}`}>
    <button type="button" className={variant === 'circle' ? 'primary discover-action action-apply' : 'primary'} disabled={disabled} aria-expanded={ready} onClick={() => setReady(!ready)}>{variant === 'circle' ? <><Zap size={25} aria-hidden="true"/><span className="action-caption">Apply</span></> : 'Apply'}</button>
    {ready && <div className="apply-disclosure"><p>You will complete the application on an external website. JobSwipe does not submit it for you.</p>
      {!url ? <button disabled={busy} onClick={start}>{busy ? 'Recording…' : 'Start application'}</button> : <><p>Recorded as Started. Select the link to continue:</p><a href={url} target="_blank" rel="noopener noreferrer">Continue to application ↗</a></>}
    </div>}{error && <p className="apply-error" role="alert">{error}</p>}
  </div>;
}

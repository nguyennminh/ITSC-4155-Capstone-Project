import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Heart, X } from 'lucide-react';
import { safeExternalUrl } from '../services/linkService.js';
import { splitSkills } from '../services/skillService.js';
import JobCard from '../components/JobCard.jsx';
import MatchInsights from '../components/MatchInsights.jsx';
import PageHeader from '../components/PageHeader.jsx';
import useSwipe from '../hooks/useSwipe.js';

const SWIPE_ANIMATION_MS = 280;

export default function Discover({ jobs, profile, confirmed, saved, started, jobSource, onSave, onApply, onReview, onDetails, recommendations: matches, loading, matchingError, notice, matchesReady, onRetry, onRefreshJobs, accountId }) {
  const storageKey = `jobswipe-skips:${accountId}`;
  const [skipped, setSkipped] = useState(() => {
    try { const value = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value.filter(id => typeof id === 'string') : []; }
    catch { return []; }
  });
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(skipped)); } catch { /* Storage can be disabled. */ } }, [storageKey, skipped]);
  const [pendingAction, setPendingAction] = useState('');
  const [applicationLink, setApplicationLink] = useState('');
  const pendingTab = useRef(null);
  const mounted = useRef(false);
  const [decisionNotice, setDecisionNotice] = useState('');
  const decisionPending = useRef(false);
  const animationTimer = useRef(null);
  const [swipeDirection, setSwipeDirection] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (animationTimer.current) window.clearTimeout(animationTimer.current);
      pendingTab.current?.close();
      pendingTab.current = null;
    };
  }, []);

  const available = (matches || []).filter(match => !skipped.includes(String(match.jobId)) && !started.includes(String(match.jobId)) && !saved.some(id => String(id) === String(match.jobId)));
  const current = available[0];
  const job = jobs.find(job => job.id === current?.jobId);
  const busy = Boolean(pendingAction || loading || swipeDirection);
  const resumeSkills = splitSkills(profile.skills);
  function advance(id) { setSkipped(ids => [...new Set([...ids, String(id)])]); }

  function skip() {
    if (!job || decisionPending.current || loading) return;
    advance(job.id);
  }

  async function saveForLater() {
    if (!job || decisionPending.current || busy) return;
    decisionPending.current = true; setPendingAction('Saving job…'); setError('');
    const selected = job;
    try {
      const success = await onSave(selected);
      if (success === false) throw new Error('Job could not be saved. Try again.');
      setDecisionNotice(`Saved ${selected.title} for later.`);
    } catch (err) { setError(err.message); }
    finally { decisionPending.current = false; setPendingAction(''); }
  }

  async function openApplication(selected) {
    decisionPending.current = true; setPendingAction('Opening application…'); setError('');
    try {
      const result = await onApply(selected);
      const url = safeExternalUrl(result.url);
      if (!url) throw new Error('This listing has no valid application link.');
      if (!mounted.current) return;
      const tab = pendingTab.current;
      if (tab && !tab.closed) {
        tab.location.replace(url);
        pendingTab.current = null;
        setDecisionNotice(`Opened ${selected.title} in a new tab. Application status: Started.`);
      } else {
        setApplicationLink(url);
        setDecisionNotice('The application tab did not open. Use the link below.');
      }
    } catch (err) { setError(err.message); }
    finally {
      pendingTab.current?.close();
      pendingTab.current = null;
      decisionPending.current = false;
      setPendingAction('');
    }
  }

  function animateDecision(direction) {
    if (!job || busy || decisionPending.current || animationTimer.current) return;
    if (direction === 'right') {
      setApplicationLink('');
      setDecisionNotice('');
      // Reserve the new tab during the gesture, before the request.
      const tab = window.open('about:blank', '_blank');
      if (tab) {
        tab.opener = null;
        pendingTab.current = tab;
      }
    }
    setSwipeDirection(direction);
    animationTimer.current = window.setTimeout(() => {
      animationTimer.current = null;
      setSwipeDirection('');
      if (direction === 'left') skip();
      else openApplication(job);
    }, SWIPE_ANIMATION_MS);
  }

  const { drag, gestures } = useSwipe({
    onLeft: () => animateDecision('left'),
    onRight: () => animateDecision('right'),
    disabled: busy
  });

  return <section>
    <PageHeader title="Your matches" subtitle={loading ? 'Finding jobs picked for you…' : !confirmed ? 'Complete your profile to find your matches' : matchesReady ? `${available.length} ${available.length === 1 ? 'job' : 'jobs'} picked for you` : 'Find roles that fit your profile'}/>
    <p>{jobSource && <>Listings from {jobSource}. </>}Swipe left to pass or right to open the employer application in a new tab. Save keeps a job for later.</p>
    
    {confirmed && !loading && matchesReady && !job && <div className="card">
      <h2>{matches.length ? 'You have reviewed all matches' : 'No matching jobs'}</h2>
      <p>Update your qualifications or broaden your preferences to find other opportunities.</p>
      {matches.length > 0 && <button onClick={() => setSkipped([])}>Review skipped jobs</button>}
    </div>}
    <p id="swipe-help" className="muted">Hold and drag the job card left to pass or right to open the application. The card highlights your choice; release near the center to cancel. You can also use the buttons or focus the card and use left/right arrow keys. Skips are remembered in this browser tab for your account.</p>
    <p role="status" aria-live="polite">{pendingAction || decisionNotice}</p>
    {applicationLink && <p><a href={applicationLink} target="_blank" rel="noopener noreferrer">Open employer application in a new tab ↗</a></p>}
    {job && <div className="discover-match-layout">
    <div className="discover-deck-area">
      <div className="discover-deck">
        {available.length > 1 && <div className="deck-backing" aria-hidden="true"/>}
      <div
      key={job.id}
      style={drag ? { transform: `translateX(${drag.x}px) rotate(${drag.x / 30}deg)` } : undefined}
      className={`swipe-surface${drag ? ' is-dragging' : ''}${swipeDirection ? ` swipe-exit-${swipeDirection}` : ''}`}
      role="region"
      aria-label="Current recommended job"
      aria-describedby="swipe-help"
      aria-busy={busy}
      tabIndex={0}
      {...gestures}
    >
      {drag && <div className={`swipe-targets${drag.x < -12 ? ' choosing-pass' : drag.x > 12 ? ' choosing-save' : ''}`} aria-hidden="true">
        <div className={`swipe-target swipe-target-pass${drag.direction === 'left' ? ' is-active' : ''}`}><strong>Pass</strong><span>Skip this job</span></div>
        <div className={`swipe-target swipe-target-save${drag.direction === 'right' ? ' is-active' : ''}`}><strong>Apply</strong><span>Open in a new tab</span></div>
      </div>}
      <JobCard job={job} recommendation={current} onDetails={onDetails}/>
    </div>
    </div>
    <div className="discover-actions">
      <button type="button" className="discover-action action-pass" disabled={busy} onClick={() => animateDecision('left')}><X size={25} aria-hidden="true"/><span className="action-caption">Pass</span></button>
      <button type="button" className="discover-action action-apply" disabled={busy} onClick={saveForLater}><Heart size={25} aria-hidden="true"/><span className="action-caption">Save</span></button>
      <button type="button" className="discover-action action-save" disabled={busy} onClick={() => animateDecision('right')}><ArrowUpRight size={25} aria-hidden="true"/><span className="action-caption">Open application</span></button>
    </div>
    <div className="gesture-hints" aria-hidden="true"><span>← Pass</span><span>View details to learn more</span><span>Apply →</span></div>
    </div>
    <MatchInsights job={job} recommendation={current} profile={profile} onDetails={onDetails}/>
    </div>}
    <div className="card">
      <h2>Find your strongest matches</h2>
      <p>Compare your confirmed skills and experience with available job listings. Explore the evidence behind each match, review potential gaps, and request a deeper explanation when you want more context.</p>
      <p className="muted">{jobSource === 'Adzuna'
        ? 'Adzuna receives your confirmed skill names to search listings.'
        : jobSource === 'Greenhouse'
          ? 'JobSwipe fetches public Greenhouse listings and matches them against your profile on its server.'
          : 'JobSwipe matches listings against your confirmed profile.'} Verify unknown work arrangements in the original posting.</p>
      {jobSource === 'Greenhouse' && <p className="muted">On the application tab, use JobSwipe Autofill if you installed the Chrome extension. Opening a form marks the application as Started; you submit it on Greenhouse.</p>}
      {confirmed && <div aria-label="Skills used for matching">
        <strong>Skills from your confirmed resume/profile</strong>
        {resumeSkills.length
          ? <div className="tags skill-tags">{resumeSkills.map((skill, index) => <span key={`${skill}-${index}`}>{skill}</span>)}</div>
          : <p className="muted">No skills are saved. Add skills in your profile or review your resume information.</p>}
      </div>}
      {!confirmed && <p className="notice">Confirm your information first. <button onClick={onReview}>Review information</button></p>}
      {loading && <p role="status">Finding your matches…</p>}
      {matchingError && <div className="notice" role="alert">
        <p>{matchingError}</p>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>}
      <p className="muted">Scores are subjective fit estimates, not hiring probabilities. Review the original posting for full requirements.</p>
      {error && <p className="profile-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
    </div>
  </section>;
}

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Heart, RefreshCw, Undo2, X } from 'lucide-react';
import { annualSalaryRange, defaultJobFilters, matchesJobFilters } from '../services/jobFilters.js';
import { safeExternalUrl } from '../services/linkService.js';
import { splitSkills } from '../services/skillService.js';
import JobCard from '../components/JobCard.jsx';
import MatchInsights from '../components/MatchInsights.jsx';
import PageHeader from '../components/PageHeader.jsx';
import useSwipe from '../hooks/useSwipe.js';

const SWIPE_ANIMATION_MS = 280;

export default function Discover({ jobs, profile, confirmed, saved, started, jobSource, onSave, onApply, onReview, onDetails, recommendations: matches, loading, matchingError, notice, matchesReady, onRetry, onRefreshJobs, preferEarlyCareer, onEarlyCareerChange, accountId }) {
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
  const [restoredJobId, setRestoredJobId] = useState(null);
  const [error, setError] = useState('');
  const filterStorageKey = `jobswipe-filters:${accountId}`;
  const [filters, setFilters] = useState(() => {
    try {
      const savedFilters = JSON.parse(sessionStorage.getItem(filterStorageKey) || '{}');
      return savedFilters && typeof savedFilters === 'object' && !Array.isArray(savedFilters)
        ? Object.fromEntries(Object.entries(defaultJobFilters).map(([key, fallback]) => [key, typeof savedFilters[key] === 'string' ? savedFilters[key] : fallback]))
        : { ...defaultJobFilters };
    } catch { return { ...defaultJobFilters }; }
  });
  useEffect(() => { try { sessionStorage.setItem(filterStorageKey, JSON.stringify(filters)); } catch { /* Storage can be disabled. */ } }, [filterStorageKey, filters]);
  const updateFilter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));
  const salaryAvailable = jobs.some(job => annualSalaryRange(job.salary) !== null);
  const effectiveFilters = salaryAvailable ? filters : { ...filters, minSalary: '', maxSalary: '' };
  const activeFilters = Object.entries(effectiveFilters).filter(([key, value]) => value !== '' && value !== 'Any');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (animationTimer.current) window.clearTimeout(animationTimer.current);
      pendingTab.current?.close();
      pendingTab.current = null;
    };
  }, []);

  const jobsById = new Map(jobs.map(job => [String(job.id), job]));
  const available = (matches || []).filter(match => {
    const candidate = jobsById.get(String(match.jobId));
    return candidate && matchesJobFilters(candidate, effectiveFilters) && !skipped.includes(String(match.jobId))
      && !started.includes(String(match.jobId)) && !saved.some(id => String(id) === String(match.jobId));
  });
  const lastSkippedId = skipped.at(-1);
  const lastSkippedJob = jobsById.get(lastSkippedId);
  const canUndo = Boolean(lastSkippedJob && matches?.some(match => String(match.jobId) === lastSkippedId)
    && !started.includes(lastSkippedId) && !saved.some(id => String(id) === lastSkippedId));
  const current = available.find(match => String(match.jobId) === restoredJobId) || available[0];
  const job = jobsById.get(String(current?.jobId));
  const busy = Boolean(pendingAction || loading || swipeDirection);
  const resumeSkills = splitSkills(profile.skills);
  function advance(id) { setSkipped(ids => [...new Set([...ids, String(id)])]); }

  function skip() {
    if (!job || decisionPending.current || loading) return;
    setRestoredJobId(null);
    advance(job.id);
    setDecisionNotice(`Skipped ${job.title}. Use Undo to restore it.`);
  }

  function undoSkip() {
    if (busy || decisionPending.current || !canUndo) return;
    if (!matchesJobFilters(lastSkippedJob, effectiveFilters)) setFilters({ ...defaultJobFilters });
    setRestoredJobId(lastSkippedId);
    setSkipped(ids => ids.slice(0, -1));
    setDecisionNotice('Last skipped job restored.');
    setError('');
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
    <div className="discover-toolbar">
      <button type="button" onClick={onRefreshJobs} disabled={!confirmed || busy || !onRefreshJobs} aria-label="Refresh job listings">
        <RefreshCw size={17} aria-hidden="true"/> {loading ? 'Refreshing jobs…' : 'Refresh Jobs'}
      </button>
    </div>
    {jobSource === 'Greenhouse' && <label>
      <input type="checkbox" checked={preferEarlyCareer} disabled={!confirmed || busy}
        onChange={event => onEarlyCareerChange(event.target.checked)} />
      Prioritize early-career jobs
    </label>}
    <div className="card discover-filters" aria-label="Filter jobs">
      <h2>Filter jobs</h2>
      <div className="discover-filter-grid">
        <label>Keyword<input value={filters.keyword} onChange={event => updateFilter('keyword', event.target.value)} placeholder="Job title or skill"/></label>
        <label>Location<input value={filters.location} onChange={event => updateFilter('location', event.target.value)} placeholder="City or state"/></label>
        <label>Company<input value={filters.company} onChange={event => updateFilter('company', event.target.value)} placeholder="Company name"/></label>
        <label>Employment type<select value={filters.type} onChange={event => updateFilter('type', event.target.value)}>{['Any', 'Full-time', 'Part-time', 'Internship', 'Contract'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Work arrangement<select value={filters.mode} onChange={event => updateFilter('mode', event.target.value)}>{['Any', 'Remote', 'Hybrid', 'On-site'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Experience level<select value={filters.experience} onChange={event => updateFilter('experience', event.target.value)}>{['Any', 'Internship', 'Entry-level', 'Mid-level', 'Senior'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Minimum annual salary ($)<input type="number" min="0" step="1000" disabled={!salaryAvailable} value={effectiveFilters.minSalary} onChange={event => updateFilter('minSalary', event.target.value)} placeholder="No minimum"/></label>
        <label>Maximum annual salary ($)<input type="number" min="0" step="1000" disabled={!salaryAvailable} value={effectiveFilters.maxSalary} onChange={event => updateFilter('maxSalary', event.target.value)} placeholder="No maximum"/></label>
      </div>
      <p className="muted">{salaryAvailable ? 'Salary filters exclude listings without annual salary data.' : 'Salary filters are unavailable for these listings.'} Experience levels are identified from explicit job titles when no level is provided.</p>
      {activeFilters.length > 0 && <div className="discover-active-filters" aria-label="Active filters">
        {activeFilters.map(([key, value]) => <button type="button" key={key} onClick={() => updateFilter(key, defaultJobFilters[key])} aria-label={`Remove ${key} filter`}>
          {key.replace(/([A-Z])/g, ' $1')}: {key.toLowerCase().includes('salary') ? `$${Number(value).toLocaleString()}` : value} ×
        </button>)}
        <button type="button" onClick={() => setFilters({ ...defaultJobFilters })}>Clear all filters</button>
      </div>}
      <p role="status" aria-live="polite">{available.length} available {available.length === 1 ? 'job' : 'jobs'} match your filters.</p>
    </div>
    <p>{jobSource && <>Listings from {jobSource}. </>}Swipe left to pass or right to open the employer application in a new tab. Save keeps a job for later.</p>
    
    {confirmed && !loading && matchesReady && !job && <div className="card">
      <h2>{available.length === 0 && activeFilters.length ? 'No jobs match your filters' : matches.length ? 'You have reviewed all matches' : 'No matching jobs'}</h2>
      <p>{activeFilters.length ? 'Remove some filters or clear all filters to see more jobs.' : 'Update your qualifications or broaden your preferences to find other opportunities.'}</p>
      {skipped.length > 0 && <div className="discover-actions">
        <button type="button" className="discover-action action-undo" disabled={busy || !canUndo} onClick={undoSkip} aria-label="Undo last skipped job"><Undo2 size={25} aria-hidden="true"/><span className="action-caption">Undo</span></button>
        <button type="button" onClick={() => { setSkipped([]); setRestoredJobId(null); setDecisionNotice('Skip history cleared.'); }}>Review skipped jobs</button>
      </div>}
    </div>}
    <p id="swipe-help" className="muted">Hold and drag the job card left to pass or right to open the application. The card highlights your choice; release near the center to cancel. You can also use the buttons or focus the card and use left/right arrow keys. Use Undo to restore the last skipped job. Skips are remembered in this browser tab for your account.</p>
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
    <div className="discover-actions discover-actions-with-undo">
      <button type="button" className="discover-action action-pass" disabled={busy} onClick={() => animateDecision('left')}><X size={25} aria-hidden="true"/><span className="action-caption">Pass</span></button>
      <button type="button" className="discover-action action-undo" disabled={busy || !canUndo} onClick={undoSkip} aria-label="Undo last skipped job"><Undo2 size={25} aria-hidden="true"/><span className="action-caption">Undo</span></button>
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

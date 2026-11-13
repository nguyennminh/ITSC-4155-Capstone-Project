const sessionExpiryListeners = new Set();

export function onSessionExpired(listener) {
  sessionExpiryListeners.add(listener);
  return () => sessionExpiryListeners.delete(listener);
}

export async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, credentials: 'same-origin' }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Could not connect to JobSwipe. Please try again.', { cause: error });
  }
  const body = await response.json().catch(() => null);
  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    for (const listener of sessionExpiryListeners) listener();
  }
  if (!response.ok) {
    if (typeof body?.error === 'string' && body.error) throw new Error(body.error);
    if (response.status >= 500) throw new Error(`JobSwipe’s server is temporarily unavailable (HTTP ${response.status}). Try again in a moment.`);
    throw new Error(`JobSwipe could not complete the request (HTTP ${response.status}). Try again.`);
  }
  if (!body) throw new Error('JobSwipe returned an unexpected response. Reload and try again.');
  return body;
}
export function jsonPost(path, body) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export function deleteAccount() {
  return api('/api/auth/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'DELETE' }) });
}
export async function parseResume(file, signal) {
  const form = new FormData();
  form.append('resume', file);
  return api('/api/resumes/parse', { method: 'POST', body: form, signal });
}
export const getSavedResume = signal => api('/api/resumes', { signal });
export const deleteSavedResume = () => api('/api/resumes/file', { method: 'DELETE' });
export function getMatches(consent, signal, earlyCareer = false) {
  // Qualifications come from the server's saved confirmed profile, not browser claims.
  return api('/api/jobs/match', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent, ...(earlyCareer ? { earlyCareer } : {}) }) });
}

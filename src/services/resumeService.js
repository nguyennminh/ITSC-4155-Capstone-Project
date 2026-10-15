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
  if (!response.ok) throw new Error(body?.error || 'Request failed. Make sure npm run server is running.');
  if (!body) throw new Error('No API response. Make sure npm run server is running.');
  return body;
}
export function jsonPost(path, body) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export async function parseResume(file, signal) {
  const form = new FormData();
  form.append('resume', file);
  return api('/api/resumes/parse', { method: 'POST', body: form, signal });
}
export function getMatches(consent, signal) {
  // Qualifications come from the server's saved confirmed profile, not browser claims.
  return api('/api/jobs/match', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent }) });
}

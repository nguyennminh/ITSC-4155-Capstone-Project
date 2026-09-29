export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: 'same-origin' });
  const body = await response.json().catch(() => null);
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
export function getMatches(useAi, signal) {
  // Qualifications come from the server's saved confirmed profile, not browser claims.
  return api('/api/jobs/match', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useAi }) });
}

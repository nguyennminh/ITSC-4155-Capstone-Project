async function readResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'Request failed. Make sure npm run server is running.');
  if (!body) throw new Error('No API response. Make sure npm run server is running.');
  return body;
}

export async function parseResume(file, signal) {
  const form = new FormData();
  form.append('resume', file);
  return readResponse(await fetch('/api/resumes/parse', { method: 'POST', body: form, signal }));
}

export async function getAiMatches(profile, signal) {
  const { skills, experience, education, certifications, title, location, mode, type } = profile;
  return readResponse(await fetch('/api/jobs/match', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed: true,
      profile: { skills, experience, education, certifications, title, location, mode, type } }),
  }));
}

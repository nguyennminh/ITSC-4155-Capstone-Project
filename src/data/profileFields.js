// Shared by the review form and profile form. Old text-only profiles still work.
export function entryText(entries = []) {
  return entries.map(entry => [entry.title, entry.organization, entry.dates, ...(entry.bullets || [])].filter(Boolean).join('\n')).join('\n\n');
}
function existingEntries(entries, text = '') {
  if (entries?.length) return entries;
  return text.trim() ? [{title:'',organization:'',dates:'',bullets:text.split('\n')}] : [];
}
export function normalizeProfile(profile = {}) {
  return { ...profile, phone: profile.phone || '', projects: profile.projects || '',
    experienceEntries: existingEntries(profile.experienceEntries, profile.experience), projectEntries: existingEntries(profile.projectEntries, profile.projects) };
}

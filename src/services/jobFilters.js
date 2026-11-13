// Filter only on information supplied by a listing. Unknown values never pass a selected filter.
export const defaultJobFilters = { keyword: '', location: '', company: '', type: 'Any', mode: 'Any', experience: 'Any', minSalary: '', maxSalary: '' };

export function annualSalaryRange(value) {
  const text = String(value || '').trim();
  // Do not treat hourly, weekly, monthly, daily or one-off compensation as annual pay.
  if (!text || /(?:\/|\bper\s+)(?:hour|hr|day|week|wk|month|mo)\b|\b(?:hourly|weekly|monthly|daily|bonus|sign.on)\b/i.test(text)) return null;
  const amounts = [...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*([kK])?\b/g)]
    .map(match => Number(match[1].replaceAll(',', '')) * (match[2] ? 1000 : 1));
  if (!amounts.length || amounts.some(amount => !Number.isFinite(amount) || amount < 1000)) return null;
  return { min: Math.min(...amounts), max: amounts.length === 1 && /\+/.test(text) ? Infinity : Math.max(...amounts) };
}

export function titleExperience(title = '') {
  if (/\b(?:intern|internship)\b/i.test(title)) return 'Internship';
  if (/\b(?:senior|sr\.?|staff|principal|lead|director)\b/i.test(title)) return 'Senior';
  if (/\b(?:junior|jr\.?|entry[ -]level|new[ -]grad(?:uate)?|early[ -]career|university graduate|graduate)\b/i.test(title)
    || /\b(?:engineer|analyst|developer|scientist|designer) I\b(?!\s*\/)/i.test(title)) return 'Entry-level';
  if (/\b(?:mid[ -]level|midlevel|intermediate)\b/i.test(title)) return 'Mid-level';
  return 'Unknown';
}

export function jobExperience(job) {
  const explicit = String(job.experienceLevel || '').trim();
  if (explicit) {
    if (/intern/i.test(explicit)) return 'Internship';
    if (/entry|junior|graduate|associate/i.test(explicit)) return 'Entry-level';
    if (/mid|intermediate/i.test(explicit)) return 'Mid-level';
    if (/senior|staff|principal|lead/i.test(explicit)) return 'Senior';
    return 'Unknown';
  }
  return titleExperience(String(job.title || ''));
}

export function matchesJobFilters(job, filters) {
  const contains = (field, value) => String(field || '').toLowerCase().includes(String(value || '').trim().toLowerCase());
  if (filters.keyword && !contains(`${job.title} ${job.company} ${job.description}`, filters.keyword)) return false;
  if (filters.location && !contains(job.location, filters.location)) return false;
  if (filters.company && !contains(job.company, filters.company)) return false;
  if (filters.type !== 'Any' && job.type !== filters.type) return false;
  if (filters.mode !== 'Any' && job.mode !== filters.mode) return false;
  if (filters.experience !== 'Any' && jobExperience(job) !== filters.experience) return false;
  if (filters.minSalary !== '' || filters.maxSalary !== '') {
    if (filters.minSalary !== '' && filters.maxSalary !== '' && Number(filters.minSalary) > Number(filters.maxSalary)) return false;
    const range = annualSalaryRange(job.salary);
    if (!range) return false;
    if (filters.minSalary !== '' && (Number(filters.minSalary) < 0 || !Number.isFinite(Number(filters.minSalary)) || range.max < Number(filters.minSalary))) return false;
    if (filters.maxSalary !== '' && (Number(filters.maxSalary) < 0 || !Number.isFinite(Number(filters.maxSalary)) || range.min > Number(filters.maxSalary))) return false;
  }
  return true;
}

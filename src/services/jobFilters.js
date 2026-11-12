// Filter only on information supplied by a listing. Unknown values never pass a selected filter.
export const defaultJobFilters = { keyword: '', location: '', company: '', type: 'Any', mode: 'Any', experience: 'Any', minSalary: '', maxSalary: '' };

export function annualSalaryRange(value) {
  const text = String(value || '');
  if (/\/\s*(?:hour|hr)\b/i.test(text)) return null;
  const amounts = [...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)(\s*[kK])?/g)]
    .map(match => Number(match[1].replaceAll(',', '')) * (match[2] ? 1000 : 1));
  if (!amounts.length) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

export function jobExperience(job) {
  if (job.experienceLevel) return String(job.experienceLevel);
  const title = String(job.title || '');
  if (/\b(?:intern|internship)\b/i.test(title)) return 'Internship';
  if (/\b(?:junior|jr\.?|entry.level|graduate)\b/i.test(title)) return 'Entry-level';
  if (/\b(?:senior|sr\.?|staff|principal|lead)\b/i.test(title)) return 'Senior';
  return 'Unknown';
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
    const range = annualSalaryRange(job.salary);
    if (!range) return false;
    if (filters.minSalary !== '' && range.max < Number(filters.minSalary)) return false;
    if (filters.maxSalary !== '' && range.min > Number(filters.maxSalary)) return false;
  }
  return true;
}

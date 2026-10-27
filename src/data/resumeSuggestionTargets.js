import { entryText } from './profileFields.js';
// IDs are constructed here, never evaluated as arbitrary object paths.
export function suggestionTargets(profile) {
  const targets = ['skills', 'education', 'certifications', 'title'].map(id => ({ id, text: profile[id] || '' }));
  for (const [list, field] of [['experienceEntries', 'experience'], ['projectEntries', 'projects']]) {
    const entries = profile[list] || [];
    if (!entries.length) targets.push({ id: field, text: profile[field] || '' });
    entries.forEach((entry, index) => (entry.bullets || []).forEach((text, bullet) => targets.push({ id: `${list}.${index}.${bullet}`, text })));
  }
  return targets.filter(target => target.text.trim()).slice(0, 80);
}
export function applySuggestion(profile, suggestion) {
  const target = suggestionTargets(profile).find(item => item.id === suggestion.target);
  if (!target || target.text !== suggestion.before) throw new Error('This section changed. Request fresh suggestions before applying this edit.');
  if (!suggestion.target.includes('.')) return { ...profile, [suggestion.target]: suggestion.after };
  const [list, index, bullet] = suggestion.target.split('.');
  const entries = profile[list].map((entry, i) => i === Number(index)
    ? { ...entry, bullets: entry.bullets.map((text, j) => j === Number(bullet) ? suggestion.after : text) } : entry);
  return { ...profile, [list]: entries, [list === 'experienceEntries' ? 'experience' : 'projects']: entryText(entries) };
}

export function suggestionLabel(profile, target) {
  const names = { skills:'Skills', education:'Education', certifications:'Certifications', title:'Desired job title', experience:'Experience', projects:'Projects' };
  if (names[target]) return names[target];
  const [list,index,bullet] = target.split('.');
  const section = list === 'experienceEntries' ? 'Experience' : 'Project';
  const title = profile[list]?.[Number(index)]?.title || `${section} ${Number(index)+1}`;
  return `${title} · bullet ${Number(bullet)+1}`;
}

import { skillCatalog } from '../../src/data/skillCatalog.js';
import { entryText } from '../../src/data/profileFields.js';

const headings = {
  skills: /^(technical skills|skills|technologies|core competencies|technical expertise|relevant skills)$/i,
  education: /^(education|academic background|academic qualifications|education and training)$/i,
  experience: /^(work experience|professional experience|experience|employment|employment history|internships|relevant experience|professional history)$/i,
  projects: /^(projects|academic projects|personal projects|selected projects|project experience|technical projects|selected technical projects)$/i,
  certifications: /^(certifications|certificates|licenses and certifications|licenses & certifications|professional certifications)$/i,
  other: /^(summary|objective|profile|awards|interests|references|activities|publications|volunteering|leadership)$/i,
};
function headingSection(line) {
  const heading = line.replace(/^[#_*\s]+|[#_*:\s]+$/g, '').trim();
  return Object.keys(headings).find(key => headings[key].test(heading));
}
function uniqueEntries(entries) {
  const seen = new Set();
  return entries.filter(entry => {
    entry.bullets = [...new Set(entry.bullets)];
    const key = JSON.stringify(entry).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
const datePattern = /(?:19|20)\d{2}|\b(?:present|current)\b/i;
const bulletPattern = /^(?:[•●▪◦*–—-]|\d+[.)])\s*/;

// Conservative segmentation: retain ambiguous lines as bullets, never invent jobs.
export function parseEntries(lines) {
  const entries = [];
  let current;
  let separated = false;
  for (const line of lines) {
    if (!line) { separated = true; continue; }
    const bullet = bulletPattern.test(line);
    const previousHasBody = current?.bullets.length > 0;
    const header = !bullet && (!current || (previousHasBody && (separated || (datePattern.test(line) && /\s[|–—]\s/.test(line)))));
    if (header) {
      const parts = line.split(/\s*\|\s*|\t+/).map(part => part.trim());
      current = { title: parts[0], organization: '', dates: '', bullets: [] };
      for (const part of parts.slice(1)) {
        if (datePattern.test(part)) current.dates = [current.dates, part].filter(Boolean).join(' | ');
        else current.organization = [current.organization, part].filter(Boolean).join(' | ');
      }
      entries.push(current);
    } else if (!bullet && !previousHasBody && datePattern.test(line) && !current.dates) current.dates = line;
    else if (!bullet && !previousHasBody && !current.organization && line.length < 140) current.organization = line;
    else current.bullets.push(line.replace(bulletPattern, ''));
    separated = false;
  }
  return uniqueEntries(entries);
}

export function parseResumeFields(text) {
  const clean = String(text || '').normalize('NFKC').replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lines = clean.split('\n').map(line => line.trim());
  const sections = { skills: [], education: [], experience: [], projects: [], certifications: [], other: [] };
  let section = 'other';
  for (const line of lines) {
    const inline = line.match(/^([^:]{2,60}):\s*(.+)$/);
    const found = headingSection(inline ? inline[1] : line);
    if (found) {
      section = found;
      if (inline) sections[section].push(inline[2]);
    } else if (!/^[_=—-]{3,}$/.test(line) && (!line || sections[section].at(-1) !== line)) sections[section].push(line);
  }
  const aliases = { JavaScript: ['js', 'ecmascript'], React: ['reactjs', 'react.js'], 'Node.js': ['nodejs', 'node js'], PostgreSQL: ['postgres'] };
  const skills = skillCatalog.filter(skill => [skill, ...(aliases[skill] || [])].some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(clean);
  }));
  const firstLine = (lines.find(Boolean) || '').replace(/^name:\s*/i, '');
  const name = firstLine.length <= 100 && /^[\p{L} .'-]+$/u.test(firstLine)
    && !Object.values(headings).some(pattern => pattern.test(firstLine)) ? firstLine : '';
  const phone = (clean.match(/(?:\+?\(?\d[\d(). -]{7,}\d)/g) || []).find(value => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 && !/^\d{4}\s*[-–]\s*\d{4}$/.test(value);
  }) || '';
  const experienceEntries = parseEntries(sections.experience);
  const projectEntries = parseEntries(sections.projects);
  return { name, email: clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '', phone,
    skills: [...new Set(skills)].join(', '), education: sections.education.join('\n').trim(),
    experience: entryText(experienceEntries), projects: entryText(projectEntries),
    experienceEntries, projectEntries, certifications: sections.certifications.join('\n').trim() };
}

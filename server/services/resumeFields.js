// A small, editable parser. It uses headings and known skill names, not AI.
import { skillCatalog } from '../../src/data/skillCatalog.js';

const headings = {
  skills: /^(technical skills|skills|technologies|core competencies)$/i,
  education: /^(education|academic background)$/i,
  experience: /^(work experience|professional experience|experience|employment|projects|academic projects|personal projects)$/i,
  certifications: /^(certifications|certificates|licenses and certifications)$/i,
  other: /^(summary|objective|profile|awards|interests|references|activities|publications|volunteering|leadership)$/i,
};

export function parseResumeFields(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  const sections = { skills: [], education: [], experience: [], certifications: [], other: [] };
  let section = 'other';
  for (const line of lines) {
    const heading = line.replace(/:$/, '').trim();
    const found = Object.keys(headings).find(key => headings[key].test(heading));
    if (found) section = found;
    else sections[section].push(line);
  }
  const skills = skillCatalog.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(text);
  });
  const firstLine = lines[0] || '';
  const name = firstLine.length <= 100 && /^[\p{L} .'-]+$/u.test(firstLine)
    && !Object.values(headings).some(pattern => pattern.test(firstLine)) ? firstLine : '';
  return {
    name,
    email: text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '',
    skills: skills.join(', '),
    education: sections.education.join('\n'),
    experience: sections.experience.join('\n'),
    certifications: sections.certifications.join('\n'),
  };
}

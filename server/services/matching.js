// Read only qualification-related properties, rather than coercing objects to [object Object].
export function qualificationText(value, depth = 0) {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => qualificationText(item, depth + 1)).join('\n');
  if (typeof value !== 'object') return '';
  const fields = ['name', 'title', 'role', 'company', 'employer', 'organization',
    'degree', 'institution', 'school', 'description', 'summary', 'bullets',
    'responsibilities', 'achievements', 'technologies', 'skills'];
  return fields.map(field => qualificationText(value[field], depth + 1)).filter(Boolean).join('\n');
}

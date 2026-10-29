export function splitSkills(value) {
  return [...new Set(String(value || '').split(/[,;\n|]+/).map(skill => skill.trim()).filter(Boolean))];
}

const localOrigins = new Set([
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:3001', 'http://localhost:3001',
]);
const greenhouse = new Set(['https://job-boards.greenhouse.io', 'https://boards.greenhouse.io']);

export function customOrigin(value) {
  if (!value.trim()) return '';
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || greenhouse.has(url.origin)) {
    throw new Error('Enter the HTTPS address of your JobSwipe deployment.');
  }
  return url.origin;
}

export function pageKind(href, origin) {
  try {
    const url = new URL(href);
    if (url.username || url.password) return 'unsupported';
    if (greenhouse.has(url.origin)) return /^\/[^/]+\/jobs\/\d+\/?$/.test(url.pathname) ? 'application' : 'unsupported';
    if (localOrigins.has(url.origin) || url.origin === origin) return 'jobswipe';
  } catch { /* No accessible tab URL. */ }
  return 'unsupported';
}

export const extraFields = [
  { key: 'linkedin', label: 'LinkedIn profile URL', type: 'url', labels: ['linkedin', 'linkedin profile', 'linkedin profile url', 'linkedin url', 'linkedin profile link'] },
  { key: 'github', label: 'GitHub profile URL', type: 'url', labels: ['github', 'github profile', 'github profile url', 'github url'] },
  { key: 'website', label: 'Portfolio or website URL', type: 'url', labels: ['portfolio', 'portfolio url', 'portfolio link', 'website', 'website url', 'personal website'] },
  { key: 'city', label: 'Current city', labels: ['current city', 'city', 'city of residence'] },
  { key: 'employer', label: 'Current employer', labels: ['current employer', 'current company', 'current employer name'] },
  { key: 'title', label: 'Current job title', labels: ['current job title', 'current title', 'current role', 'current position'] },
];

const decline = ['Prefer not to answer', 'I don’t wish to answer', 'I do not wish to answer', 'Decline to self-identify', 'Prefer not to say', 'I prefer not to say', 'Decline to disclose', 'I do not wish to disclose'];
export const selfIdFields = [
  { key: 'gender', label: 'Gender', primary: ['gender'], labels: ['gender', 'gender identity', 'what is your gender', 'what is your gender identity', 'please indicate your gender', 'how would you describe your gender'], options: [
    ['Man / Male', 'Male', 'Man', 'Male / Man', 'I identify as a man', 'I identify as male', 'I am male'],
    ['Woman / Female', 'Female', 'Woman', 'Female / Woman', 'I identify as a woman', 'I identify as female', 'I am female'],
    ['Non-binary', 'Nonbinary', 'Non binary', 'Non-binary or third gender', 'I identify as non-binary'], decline,
  ] },
  { key: 'ethnicity', label: 'Race or ethnicity', primary: ['race and ethnicity'], labels: ['race and ethnicity', 'race or ethnicity', 'race/ethnicity', 'ethnicity'], options: [
    ['American Indian or Alaska Native'], ['Asian'], ['Black or African American', 'Black / African American'],
    ['Hispanic or Latino', 'Hispanic / Latino', 'Hispanic or Latine'], ['Native Hawaiian or Other Pacific Islander'],
    ['White'], ['Two or more races', 'Multiracial'], decline,
  ] },
  { key: 'veteran', label: 'Protected veteran status', labels: ['veteran status', 'protected veteran status', 'are you a protected veteran', 'do you identify as a protected veteran', 'please indicate your veteran status', 'please select your veteran status', 'voluntary self-identification of veteran status', 'voluntary self-identification of protected veteran status'],
    primary: ['protected veteran status', 'are you a protected veteran'],
    yesNo: ['are you a protected veteran', 'do you identify as a protected veteran'], options: [
      ['I identify as a protected veteran', 'I am a protected veteran', 'Protected veteran', 'Yes, I am a protected veteran', 'I identify as one or more of the classifications of a protected veteran', 'I identify as one or more classifications of a protected veteran'],
      ['I am not a protected veteran', 'Not a protected veteran', 'No, I am not a protected veteran', 'I do not identify as a protected veteran', 'I do not fall into any of the protected veteran classifications'], decline,
    ] },
  { key: 'disability', label: 'Disability status', labels: ['disability status', 'voluntary self-identification of disability'], options: [
    ['I have a disability or have had one in the past', 'Yes, I have a disability, or have had one in the past'],
    ['I do not have a disability and have not had one in the past', 'No, I do not have a disability and have not had one in the past'], decline,
  ] },
];

export function selections(values) {
  return selfIdFields.flatMap(field => {
    const index = field.options.findIndex(options => options[0] === values?.[field.key]);
    return index < 0 ? [] : [{
      label: field.label, labels: field.labels, primary: field.primary || [], options: field.options[index],
      ...(field.yesNo && index < 2 ? { contextual: { labels: field.yesNo, value: index ? 'No' : 'Yes' } } : {}),
    }];
  });
}

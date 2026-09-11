// Fictional fixtures. Replace these through services/jobService.js.
export const jobs = [
  { id: 1, title: 'Junior Software Engineer', company: 'Example Software', location: 'Charlotte, NC', mode: 'Hybrid', type: 'Full-time', skills: ['JavaScript', 'React', 'SQL'], description: 'Build web features, write tests, and collaborate with a small engineering team.', salary: '$70,000–$90,000' },
  { id: 2, title: 'Data Engineering Intern', company: 'Example Analytics', location: 'Raleigh, NC', mode: 'Remote', type: 'Internship', skills: ['Python', 'SQL', 'Git'], description: 'Help clean data, build pipelines, and document reliable data workflows.', salary: '$25–$30/hour' },
  { id: 3, title: 'Frontend Developer', company: 'Example Digital', location: 'Atlanta, GA', mode: 'On-site', type: 'Full-time', skills: ['JavaScript', 'CSS', 'React'], description: 'Create accessible interfaces and connect frontend components to APIs.', salary: '$65,000–$85,000' }
];
export const applicants = [
  { id: 1, name: 'Alex Chen', skills: 'React, JavaScript, SQL', education: 'B.S. Computer Science', experience: 'Software engineering internship', status: 'New' },
  { id: 2, name: 'Jordan Lee', skills: 'Python, SQL, Git', education: 'B.S. Data Science', experience: 'Data pipeline capstone project', status: 'New' }
];
export const emptyProfile = { name: '', skills: '', experience: '', education: '', certifications: '', title: 'Software Engineer', location: '', mode: 'Any', type: 'Any', resumeName: '' };


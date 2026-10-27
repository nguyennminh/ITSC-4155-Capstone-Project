import { jsonPost } from './resumeService.js';
export const requestResumeSuggestions = consent => jsonPost('/api/resumes/suggestions', { consent });

// Test-only API runner. Production never loads these injected fixtures.
import { createApp } from '../../server/app.js';
import { jobs } from '../../src/data/mockData.js';
const fixtures = jobs.map(job => ({ ...job, id: String(job.id), source: 'Test provider', postingUrl: `https://example.org/jobs/${job.id}`, applyUrl: `https://example.org/jobs/${job.id}` }));
createApp({ jobProvider: { getJobs: async () => fixtures }, explain: async (profile,batch) => batch.map(job => ({jobId: job.id,score: job.id === '3' ? 99 : 50,reasons:['Test-only AI assessment'],missing:[]})).sort((a,b)=>b.score-a.score) }).listen(3001,'127.0.0.1');

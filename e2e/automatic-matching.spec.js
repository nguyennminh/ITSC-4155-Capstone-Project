import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';

const job = { id: 'auto-job', title: 'Data Engineer', company: 'Example', skills: ['Python'], description: 'Build data pipelines', mode: 'Remote', type: 'Full-time' };
const result = { jobs: [job], matches: [{ jobId: job.id, score: 80, matched: ['Python'], missing: [], reasons: [] }] };

async function setup(page, { confirmed = true, skills = 'Python', role = 'Job seeker', match = () => result } = {}) {
  let user = { id: 'auto-user', role, confirmed, profile: { ...emptyProfile, name: 'Auto Tester', email: 'auto@example.org', skills } };
  const requests = [];
  let calls = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let json = {};
    if (path === '/api/auth/me') json = { user };
    if (path === '/api/auth/logout') user = null;
    if (path === '/api/auth/login') {
      user = { id: 'second-user', role: 'Job seeker', confirmed: true, profile: { ...emptyProfile, name: 'Second User', skills: 'SQL' } };
      json = { user };
    }
    if (path === '/api/profile/confirm') {
      user = { ...user, confirmed: true, profile: route.request().postDataJSON().profile };
      json = { user };
    }
    if (path === '/api/jobs') json = { jobs: [job] };
    if (path === '/api/jobs/match') {
      const response = await match(++calls);
      if (response.error) return route.fulfill({ status: 503, json: response });
      json = response;
    }
    if (path === '/api/saved-jobs') json = { savedJobs: [] };
    if (path === '/api/applications') json = { applications: [] };
    await route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Preferences', exact: true })).toBeVisible();
  return { requests, calls: () => calls };
}
const card = page => page.getByRole('region', { name: 'Current recommended job' });
const navigate = (page, name) => page.getByRole('button', { name, exact: true }).click();
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('loads once automatically and keeps pending and completed results across navigation', async ({ page }) => {
  const pending = deferred();
  const state = await setup(page, { match: () => pending.promise });
  await expect(page.getByText('Finding your matches…')).toBeVisible();
  await navigate(page, 'Saved');
  await navigate(page, 'Discover');
  expect(state.calls()).toBe(1);
  pending.resolve(result);
  await expect(card(page)).toContainText('Data Engineer');
  await navigate(page, 'Saved');
  await navigate(page, 'Discover');
  await expect(card(page)).toBeVisible();
  expect(state.calls()).toBe(1);
  expect(state.requests).not.toContain('/api/jobs');
  await expect(page.getByRole('button', { name: 'Rank jobs', exact: true })).toHaveCount(0);
});

test('reranks automatically after profile saves', async ({ page }) => {
  const state = await setup(page);
  await expect(card(page)).toBeVisible();
  await navigate(page, 'Preferences');
  await page.getByLabel('Skills', { exact: true }).fill('SQL');
  await navigate(page, 'Save and confirm changes');
  await expect.poll(state.calls).toBe(2);
  await navigate(page, 'Discover');
  await expect(card(page)).toBeVisible();
  await expect(page.getByLabel('Skills used for matching')).toContainText('SQL');
});

test('offers retry after failure and retains successful empty results', async ({ page }) => {
  const state = await setup(page, { match: call => call === 1 ? { error: 'Matching unavailable' } : { jobs: [], matches: [] } });
  await expect(page.getByRole('alert')).toContainText('Matching unavailable');
  await navigate(page, 'Retry');
  await expect(page.getByRole('heading', { name: 'No matching jobs' })).toBeVisible();
  await navigate(page, 'Saved');
  await navigate(page, 'Discover');
  await expect(page.getByRole('heading', { name: 'No matching jobs' })).toBeVisible();
  expect(state.calls()).toBe(2);
});

for (const options of [{ skills: '' }, { confirmed: false }, { role: 'Recruiter' }]) {
  test('does not preload for ' + JSON.stringify(options), async ({ page }) => {
    const state = await setup(page, options);
    await expect(page.locator('h1')).toBeVisible();
    expect(state.calls()).toBe(0);
    if (options.skills === '') {
      await expect(page.getByText('No skills are saved.', { exact: false })).toBeVisible();
    }
  });
}

test('ignores an old matching response after the profile changes', async ({ page }) => {
  const pending = deferred();
  const state = await setup(page, { match: call => call === 1 ? pending.promise : { jobs: [], matches: [] } });
  await expect(page.getByText('Finding your matches…')).toBeVisible();
  await navigate(page, 'Preferences');
  await page.getByLabel('Skills', { exact: true }).fill('SQL');
  await navigate(page, 'Save and confirm changes');
  await expect.poll(state.calls).toBe(2);
  await navigate(page, 'Discover');
  await expect(page.getByRole('heading', { name: 'No matching jobs' })).toBeVisible();
  pending.resolve(result);
  await navigate(page, 'Saved');
  await navigate(page, 'Discover');
  await expect(page.getByRole('heading', { name: 'No matching jobs' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('ignores pending results after logout and signing into another account', async ({ page }) => {
  const pending = deferred();
  await setup(page, { match: call => call === 1 ? pending.promise : { jobs: [], matches: [] } });
  await expect(page.getByText('Finding your matches…')).toBeVisible();
  await navigate(page, 'Account options');
  await navigate(page, 'Sign out');
  await page.getByLabel('Email', { exact: true }).fill('second@example.org');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await navigate(page, 'Sign in');
  await expect(page.getByRole('heading', { name: 'No matching jobs' })).toBeVisible();
  pending.resolve(result);
  await navigate(page, 'Saved');
  await navigate(page, 'Discover');
  await expect(page.getByRole('heading', { name: 'No matching jobs' })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

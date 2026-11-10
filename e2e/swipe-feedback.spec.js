import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';

async function setup(page, fail = false, overrides = {}, extraJobs = [], options = {}) {
  let savedJobs = [];
  let saves = 0;
  let starts = 0;
  const job = { id: 'drag-test', title: 'Data Engineer', company: 'Example', skills: ['Python'], description: 'Build pipelines.', postingUrl: 'https://example.org/job', mode: 'Remote', ...overrides };
  const jobs = [job, ...extraJobs];
  await page.context().route('https://example.org/job', route => route.fulfill({ body: 'Employer application' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = {};
    if (path === '/api/auth/me') json = { user: { id: 'drag-user', confirmed: true, role: 'Job seeker', profile: { ...emptyProfile, skills: 'Python, Snowflake, Machine Learning, Pandas, scikit-learn', ...options.profile } } };
    if (path === '/api/jobs') json = { jobs };
    if (path === '/api/jobs/match') json = { jobs, jobSource: 'Greenhouse', matches: jobs.map(item => ({ jobId: item.id, score: 80, matched: (item.skills || []).filter(skill => skill === 'Python'), missing: [], reasons: [], ...options.recommendation })) };
    if (path === '/api/applications') json = { applications: [] };
    if (path === '/api/applications/start') {
      starts++;
      if (options.failStart) return route.fulfill({ status: 503, json: { error: 'Application unavailable. Try again.' } });
      json = { applications: [{ id: job.id, status: 'Started' }], url: job.postingUrl };
    }
    if (path === '/api/saved-jobs') {
      if (route.request().method() === 'POST') {
        saves++;
        if (fail) return route.fulfill({ status: 503, json: { error: 'Save unavailable' } });
        savedJobs = [job];
      }
      json = { jobs: [], savedJobs };
    }
    await route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.locator('.job-card h2')).toHaveText(job.title);
  return { saves: () => saves, starts: () => starts };
}

test('skills stay intact; holding reveals targets; a right drop opens the application in a new tab', async ({ page }) => {
  const { saves, starts } = await setup(page);
  await expect(page.locator('section').getByText(/Listings from Greenhouse. Swipe left/)).toBeVisible();
  await expect(page.locator('.skill-tags span')).toHaveText(['Python', 'Snowflake', 'Machine Learning', 'Pandas', 'scikit-learn']);
  const card = page.locator('.swipe-surface');
  await expect(card).toHaveCSS('animation-name', 'job-card-enter');
  const bounds = await page.locator('.discover-match-layout').boundingBox();
  const pageBounds = await page.locator('div.container').boundingBox();
  expect(Math.abs((bounds.x + bounds.width / 2) - (pageBounds.x + pageBounds.width / 2))).toBeLessThan(2);
  await expect(page.getByRole('button', { name: 'Pass', exact: true })).toBeVisible();
  const title = page.locator('.job-card h2');
  await title.scrollIntoViewIfNeeded();
  const box = await title.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await expect(page.locator('.swipe-surface > .swipe-targets')).toBeVisible();
  await expect(page.locator('.swipe-targets')).toHaveCSS('position', 'absolute');
  await page.mouse.move(box.x + 140, box.y + 10, { steps: 8 });
  await expect(page.locator('.swipe-target-save')).toHaveClass(/is-active/);
  await expect(page.locator('.swipe-targets')).toHaveClass(/choosing-save/);
  const opened = page.context().waitForEvent('page');
  await page.mouse.up();
  const employer = await opened;
  await expect(employer).toHaveURL('https://example.org/job');
  await expect(page.getByRole('heading', { name: 'Your matches' })).toBeVisible();
  expect(await employer.evaluate(() => window.opener)).toBeNull();
  expect(starts()).toBe(1);
  expect(saves()).toBe(0);
});

test('center release cancels; left drop skips without saving or opening application preview', async ({ page }) => {
  const { saves, starts } = await setup(page);
  const title = page.locator('.job-card h2');
  await title.scrollIntoViewIfNeeded();
  let box = await title.boundingBox();
  await page.mouse.move(box.x + 150, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 10); await page.mouse.up();
  await expect(title).toHaveText('Data Engineer');
  await expect(page.locator('.swipe-targets')).toHaveCount(0);
  box = await title.boundingBox();
  await page.mouse.move(box.x + 150, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 10, { steps: 8 });
  await expect(page.locator('.swipe-target-pass')).toHaveClass(/is-active/);
  await page.mouse.up();
  await expect(title).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(saves()).toBe(0);
  expect(starts()).toBe(0);
});

test('save failure retains the job and does not claim success in a popup', async ({ page }) => {
  await setup(page, true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Job could not be saved');
  await expect(page.locator('.job-card h2')).toHaveText('Data Engineer');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('touch layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('touch drag right opens the application in a new tab', async ({ page }) => {
    await setup(page);
    const title = page.locator('.job-card h2');
    await title.scrollIntoViewIfNeeded();
    const box = await title.boundingBox();
    const session = await page.context().newCDPSession(page);
    const start = { x: box.x + 20, y: box.y + 10 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await expect(page.locator('.swipe-targets')).toBeVisible();
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 120, y: start.y + 2 }] });
    await expect(page.locator('.swipe-target-save')).toHaveClass(/is-active/);
    const opened = page.context().waitForEvent('page');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(await opened).toHaveURL('https://example.org/job');
    await expect(page.getByRole('heading', { name: 'Your matches' })).toBeVisible();
    await session.detach();
  });
});


test('card summary keeps real data and opens full match evidence', async ({ page }) => {
  await setup(page);
  const card = page.locator('.job-card');
  await expect(card.locator('.company-initial')).toHaveText('E');
  await expect(card.locator('.job-fit-pill')).toHaveText('80/100 fit estimate');
  await expect(card.locator('.job-card-salary')).toHaveText('Salary not provided');
  await expect(card.locator('.job-card-meta')).toContainText('Location not provided');
  await expect(card.locator('.match-explanation')).toHaveCount(0);
  await expect(page.locator('.deck-backing')).toHaveCount(0);
  await page.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog', { name: 'Job details' }).getByRole('region', { name: 'Match insights' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('application error closes the pending tab and keeps the current card', async ({ page }) => {
  const { saves, starts } = await setup(page, false, {}, [], { failStart: true });
  const opened = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Open application', exact: true }).click();
  const tab = await opened;
  await expect(page.getByRole('alert')).toContainText('Application unavailable. Try again.');
  await expect(page.locator('.job-card h2')).toHaveText('Data Engineer');
  expect(tab.isClosed()).toBe(true);
  expect(starts()).toBe(1);
  expect(saves()).toBe(0);
});

test('a blocked tab leaves a safe fallback link', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole('button', { name: 'Open application', exact: true }).click();
  const fallback = page.getByRole('link', { name: /Open employer application in a new tab/ });
  await expect(fallback).toHaveAttribute('href', 'https://example.org/job');
  await expect(fallback).toHaveAttribute('rel', 'noopener noreferrer');
});

test('cards fit narrow screens in both themes', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await setup(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await expect(page.locator('.job-card h2')).toBeVisible();
    const bounds = await page.locator('.job-card').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  }
  await page.screenshot({ path: testInfo.outputPath('card-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await page.screenshot({ path: testInfo.outputPath('card-desktop.png'), fullPage: true });
});


test('deck advances to the next listing and Saved retains the shared card design', async ({ page }) => {
  const longTitle = 'Senior Platform Engineer for Enterprise Data Infrastructure and Distributed Systems';
  await setup(page, false, { title: longTitle, company: '', skills: ['Python', 'Distributed systems'] }, [
    { id: 'second-job', title: 'Next role', company: 'Another team', description: 'Build tools.', skills: [] }
  ]);
  await expect(page.locator('.deck-backing')).toBeVisible();
  await expect(page.locator('.company-initial')).toHaveText('?');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.job-card h2')).toHaveText('Next role');
  await expect(page.locator('.deck-backing')).toHaveCount(0);
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.locator('.job-card h2')).toHaveText(longTitle);
  await expect(page.locator('.job-card-heading p')).toHaveText('Company not provided');
  await expect(page.locator('.job-card-skills')).toContainText('Distributed systems');
  await expect(page.locator('.discover-actions')).toHaveCount(0);
  await page.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog', { name: 'Job details' })).toBeVisible();
});


test('match panel shows actual skills, gaps, work preference and opens evidence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, false, {}, [], {
    profile: { mode: 'Remote' },
    recommendation: { missing: ['SQL'], warnings: ['Verify experience requirements in the original posting.'] }
  });
  const panel = page.getByRole('complementary', { name: 'Why it’s a match' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('80');
  await expect(panel).toContainText('1 skill in common');
  await expect(panel).toContainText('Python');
  await expect(panel).toContainText('1 skill to review');
  await expect(panel).toContainText('SQL');
  await expect(panel).toContainText('Work style matches');
  await expect(panel).toContainText('Verify experience requirements');
  const cardBounds = await page.locator('.job-card').boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(panelBounds.x).toBeGreaterThan(cardBounds.x + cardBounds.width);
  await page.locator('.discover-match-layout').screenshot({ path: testInfo.outputPath('match-desktop.png') });
  await panel.getByRole('button', { name: 'View full job details' }).click();
  await expect(page.getByRole('dialog', { name: 'Job details' }).getByRole('region', { name: 'Match insights' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 360, height: 800 });
  const mobilePanel = await panel.boundingBox();
  const controls = await page.locator('.discover-actions').boundingBox();
  expect(mobilePanel.y).toBeGreaterThan(controls.y + controls.height);
  expect(mobilePanel.x + mobilePanel.width).toBeLessThanOrEqual(360);
  await page.locator('.discover-match-layout').screenshot({ path: testInfo.outputPath('match-mobile.png') });
});

test('match panel handles zero scores and absent overlap without inventing preferences', async ({ page }) => {
  await setup(page, false, { skills: [] }, [], { recommendation: { score: 0 } });
  const panel = page.getByRole('complementary', { name: 'Why it’s a match' });
  await expect(panel.locator('.insight-score-ring b')).toHaveText('0');
  await expect(panel).toContainText('No confirmed skill overlap was found');
  await expect(panel).not.toContainText('Work style matches');
  await expect(panel).not.toContainText('Salary meets');
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

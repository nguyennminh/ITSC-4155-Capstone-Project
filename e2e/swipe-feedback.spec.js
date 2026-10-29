import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';

async function setup(page, fail = false) {
  let saves = 0;
  const job = { id: 'drag-test', title: 'Data Engineer', company: 'Example', skills: ['Python'], description: 'Build pipelines.', postingUrl: 'https://example.org/job', mode: 'Remote' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = {};
    if (path === '/api/auth/me') json = { user: { id: 'drag-user', confirmed: true, role: 'Job seeker', profile: { ...emptyProfile, skills: 'Python, Snowflake, Machine Learning, Pandas, scikit-learn' } } };
    if (path === '/api/jobs') json = { jobs: [job] };
    if (path === '/api/jobs/match') json = { jobs: [job], matches: [{ jobId: job.id, score: 80, matched: ['Python'], missing: [], reasons: [] }] };
    if (path === '/api/applications') json = { applications: [] };
    if (path === '/api/saved-jobs') {
      if (route.request().method() === 'POST') {
        saves++;
        if (fail) return route.fulfill({ status: 503, json: { error: 'Save unavailable' } });
      }
      json = { jobs: [], savedJobs: [] };
    }
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Rank jobs', exact: true }).click();
  await expect(page.locator('.job-card h2')).toHaveText('Data Engineer');
  return () => saves;
}

test('skills stay intact; holding reveals targets; a right drop saves and shows placeholder', async ({ page }) => {
  const saves = await setup(page);
  await expect(page.locator('.skill-tags span')).toHaveText(['Python', 'Snowflake', 'Machine Learning', 'Pandas', 'scikit-learn']);
  const card = page.locator('.swipe-surface');
  await expect(card).toHaveCSS('animation-name', 'job-card-enter');
  const bounds = await card.boundingBox();
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
  await page.mouse.up();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('no application has been submitted');
  expect(saves()).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('center release cancels; left drop skips without saving or opening application preview', async ({ page }) => {
  const saves = await setup(page);
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
  test('touch drag right highlights Save and opens the placeholder', async ({ page }) => {
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
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Keep exploring' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await session.detach();
  });
});

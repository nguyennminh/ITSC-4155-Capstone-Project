import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

async function openPopup(page, tabUrl, origin = '') {
  await page.addInitScript(({ tabUrl, origin }) => {
    Object.assign(window.chrome ?? (window.chrome = {}), {
      tabs: { query: async () => [{ id: 1, url: tabUrl }] },
      storage: {
        local: { get: async () => ({ origin }) },
        session: { get: async () => (origin || tabUrl.includes('greenhouse.io') ? { jobswipeImport: {
          expires: Date.now() + 60000,
          profile: { name: 'Fictional Applicant', email: 'example@example.org' },
          resume: { name: 'long-resume-name-'.repeat(12) + '.pdf' },
          selfId: { gender: 'Man / Male', veteran: 'I am not a protected veteran' },
        } } : {}) },
      },
      scripting: { executeScript: async () => [{ result: {
        filled: ['Name'], notes: [], missing: Array.from({ length: 12 }, (_, index) => ({
          label: `Screening question ${index + 1}`, required: true,
        })),
      } }] },
    });
  }, { tabUrl, origin });
  const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
  await page.route('**/popup-test/*', async route => {
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    const contentType = types[file.split('.').at(-1)];
    const body = await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8');
    await route.fulfill({ contentType, body });
  });
  await page.goto('/popup-test/popup.html');
}

test('application actions stay visible as the checklist scrolls in a narrow popup', async ({ page }) => {
  await page.setViewportSize({ width: 260, height: 280 });
  await openPopup(page, 'https://job-boards.greenhouse.io/example/jobs/123');
  const fill = page.getByRole('button', { name: 'Fill with JobSwipe' });
  await expect(fill).toBeInViewport({ ratio: 1 });
  await expect(page.getByText('Connect a hosted JobSwipe app')).toBeHidden();
  await fill.click();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await page.locator('.popup-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText('Screening question 12 · Required', { exact: true })).toBeInViewport();
  await expect(fill).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(260);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(280);
});

test('first connection opens the hosted address setting', async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 280 });
  await openPopup(page, 'https://job-swipe.example.org');
  await expect(page.getByLabel('Trusted JobSwipe HTTPS address')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Import JobSwipe profile' })).toBeHidden();
});

test('import stays in view with optional fields expanded on a connected JobSwipe tab', async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 280 });
  await openPopup(page, 'https://job-swipe.example.org', 'https://job-swipe.example.org');
  await page.getByText('Optional links and current work details', { exact: true }).click();
  await page.getByText('Optional voluntary self-ID answers', { exact: true }).click();
  await page.locator('.popup-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('button', { name: 'Import JobSwipe profile' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Fill with JobSwipe' })).toBeHidden();
});

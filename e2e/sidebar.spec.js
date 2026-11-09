import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';

async function setup(page, { role = 'Job seeker', confirmed = true, name = 'Maya Singh' } = {}) {
  await page.goto('/');
  const email = `sidebar-${crypto.randomUUID()}@example.org`;
  await page.request.post('/api/auth/register', { data: { name, email, password: 'sidebar-test-password', role } });
  if (confirmed) await page.request.post('/api/profile/confirm', { data: { confirmed, profile: { ...emptyProfile, name, email, skills: 'React, SQL' } } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account options', exact: true })).toBeVisible();
  return email;
}

test('sidebar uses account data, live saved counts, and existing destinations', async ({ page }) => {
  const email = await setup(page);
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.locator('.avatar')).toHaveText('MS');
  await expect(sidebar).toContainText(email);
  await expect(sidebar.locator('.saved-count')).toHaveText('0');
  await expect(sidebar.getByRole('button', { name: 'Discover', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.request.post('/api/saved-jobs', { data: { jobId: '3' } });
  await page.reload();
  await expect(sidebar.locator('.saved-count')).toHaveText('1');
  await sidebar.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.getByRole('button', { name: /Remove/i }).click();
  await expect(sidebar.locator('.saved-count')).toHaveText('0');
  await sidebar.getByRole('button', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Preferences', exact: true }).click();
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Maya Singh');
});

test('account disclosure supports keyboard dismissal, outside click, theme persistence and sign-out', async ({ page }) => {
  await setup(page);
  const trigger = page.getByRole('button', { name: 'Account options', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.locator('.brand').click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await trigger.click();
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('recruiter keeps Applicants and unconfirmed users keep onboarding', async ({ page }) => {
  await setup(page, { role: 'Recruiter', confirmed: false });
  await expect(page.getByRole('button', { name: 'Applicants', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Discover', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account options', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await setup(page, { confirmed: false });
  await expect(page.getByRole('heading', { name: /Upload (and parse )?your resume/ })).toBeVisible();
});

for (const width of [320, 1280]) test(`sidebar fits long account details in both themes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await setup(page, { name: 'Maya Verylongfamilynamewithmanycharacters Singh' });
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Account options', exact: true }).click();
      await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Account options', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/jobswipe-sidebar-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
});

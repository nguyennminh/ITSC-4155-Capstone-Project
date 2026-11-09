import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function signUp(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Resume Tester');
  await page.getByLabel('Email', { exact: true }).fill(`resume-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('long-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Upload and parse your resume' })).toBeVisible();
}

const input = page => page.getByLabel('Select your resume', { exact: true });
const preview = page => page.locator('iframe[title="Resume PDF preview"]');

test('dropzone validates files and previews/replaces/removes local resumes', async ({ page }) => {
  await signUp(page);
  const dropzone = page.getByRole('button', { name: 'Upload resume', exact: true });
  await expect(dropzone).toBeVisible();
  await dropzone.focus();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const chooser = await chooserPromise;
  await chooser.setFiles('test/fixtures/resume.pdf');
  await expect(dropzone).toHaveCount(0);
  await expect(preview(page)).toHaveAttribute('src', /^blob:/);
  const firstUrl = await preview(page).getAttribute('src');

  for (const [file, message] of [
    [{ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') }, 'Please select a PDF or DOCX file.'],
    [{ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) }, 'This file is empty.'],
    [{ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }, '10 MB or smaller'],
  ]) {
    await input(page).setInputFiles(file);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(preview(page)).toHaveAttribute('src', firstUrl);
  }

  const replacementPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace resume', exact: true }).click();
  const replacement = await replacementPromise;
  await expect(preview(page)).toHaveAttribute('src', firstUrl);
  await replacement.setFiles('test/fixtures/resume.docx');
  await expect(preview(page)).toHaveCount(0);
  await expect(page.locator('.resume-details strong')).toHaveText('resume.docx');
  await expect(page.getByRole('link', { name: 'Download resume', exact: true })).toHaveAttribute('href', /^blob:/);
  await expect(page.locator('#resume-error')).toBeEmpty();
  // The old PDF URL must be released after replacement.
  expect(await page.evaluate(async url => {
    try { await fetch(url); return false; } catch { return true; }
  }, firstUrl)).toBe(true);
  await page.getByRole('button', { name: 'Remove resume', exact: true }).click();
  await expect(dropzone).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parse resume', exact: true })).toBeDisabled();

  await dropzone.evaluate(element => {
    const dataTransfer = new DataTransfer();
    for (const name of ['one.pdf', 'two.pdf']) dataTransfer.items.add(new File(['pdf'], name, { type: 'application/pdf' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
  });
  await expect(page.getByRole('alert')).toContainText('one resume at a time');
  await expect(dropzone).toBeVisible();
});

test('saved PDF stays available across reload and local replacement removal', async ({ page }) => {
  let saved = true;
  await page.route('**/api/resumes', route => route.fulfill({ json: { resume: saved ? { name: 'saved.pdf', size: 1024 } : null } }));
  const pdf = await readFile('test/fixtures/resume.pdf');
  await page.route('**/api/resumes/file', async route => {
    if (route.request().method() === 'DELETE') {
      saved = false;
      await route.fulfill({ json: { resume: null, user: { profile: {} } } });
    } else await route.fulfill({ contentType: 'application/pdf', body: pdf });
  });
  await signUp(page);
  await expect(preview(page)).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('button', { name: 'Upload resume', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(preview(page)).toHaveAttribute('src', /^blob:/);
  await input(page).setInputFiles('test/fixtures/resume.docx');
  await expect(page.locator('.resume-details strong')).toHaveText('resume.docx');
  await page.getByRole('button', { name: 'Remove resume', exact: true }).click();
  await expect(page.locator('.resume-details strong')).toHaveText('saved.pdf');
  await expect(preview(page)).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Delete saved resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Upload resume', exact: true })).toBeVisible();
});

test('failed saved preview retains download and replacement controls on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/resumes', route => route.fulfill({ json: { resume: { name: 'saved.pdf', size: 1024 } } }));
  await page.route('**/api/resumes/file', route => route.fulfill({ status: 500 }));
  await signUp(page);
  await expect(page.getByText('Could not load the preview.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download saved resume' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace resume', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

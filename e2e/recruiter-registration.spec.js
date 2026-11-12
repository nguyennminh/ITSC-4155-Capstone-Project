import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const password = 'a-long-test-password';

test('new recruiter completes company profile before accessing dashboard', async ({ page }) => {
  const email = `recruiter-${randomUUID()}@example.com`;

  await page.goto('/');

  await page.getByRole('button', {
    name: 'Create an account',
    exact: true
  }).click();

  await page.getByLabel('Name', { exact: true })
    .fill('Taylor Recruiter');

  await page.getByLabel('Email', { exact: true })
    .fill(email);

  await page.getByLabel('Password', { exact: true })
    .fill(password);

  await page.getByRole('combobox', {
    name: 'Role',
    exact: true
  }).selectOption('Recruiter');

  const registration = page.waitForResponse(response =>
    response.url().endsWith('/api/auth/register')
  );

  await page.getByRole('button', {
    name: 'Create account',
    exact: true
  }).click();

  expect((await registration).status()).toBe(201);

  await expect(
    page.getByRole('heading', { name: 'Recruiter profile' })
  ).toBeVisible();

  await expect(
    page.getByRole('heading', { name: 'Applicant dashboard' })
  ).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: 'Qualifications' })
  ).toHaveCount(0);

  // Company name is required.
  await page.getByRole('button', {
    name: 'Save recruiter profile',
    exact: true
  }).click();

  await expect(
    page.getByRole('alert')
  ).toHaveText('Please enter your company name.');

  // Complete the recruiter profile.
  await page.getByLabel('Professional title', { exact: true })
    .fill('Talent Acquisition Specialist');

  await page.getByLabel('Company name *', { exact: true })
    .fill('Example Company');

  await page.getByLabel('Company website', { exact: true })
    .fill('https://example.com');

  await page.getByLabel('Contact email', { exact: true })
    .fill('careers@example.com');

  await page.getByLabel('Contact phone', { exact: true })
    .fill('704-555-1234');

  await page.getByLabel('Company description', { exact: true })
    .fill('Example Company is a technology company hiring talented professionals.');

  // Check the profile preview.
  await page.getByRole('button', {
    name: 'Preview profile',
    exact: true
  }).click();

  await expect(
    page.getByText('Example Company is a technology company hiring talented professionals.')
  ).toBeVisible();

  // Save the profile and confirm dashboard access.
  await page.getByRole('button', {
    name: 'Save recruiter profile',
    exact: true
  }).click();

  await expect(
    page.getByRole('heading', { name: 'Applicant dashboard' })
  ).toBeVisible();

  // Reload to verify the recruiter account remains confirmed.
  await page.reload();

  await expect(
    page.getByRole('heading', { name: 'Applicant dashboard' })
  ).toBeVisible();

  // Verify the company information was persisted.
  await page.getByRole('button', {
    name: 'Preferences',
    exact: true
  }).click();

  await expect(
    page.getByLabel('Company name *', { exact: true })
  ).toHaveValue('Example Company');

  await expect(
    page.getByLabel('Contact email', { exact: true })
  ).toHaveValue('careers@example.com');
});
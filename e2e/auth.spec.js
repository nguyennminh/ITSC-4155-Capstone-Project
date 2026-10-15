import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const password = 'a-long-test-password';

async function register(page, role = 'Job seeker') {
  const email = `auth-${randomUUID()}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Alex Student');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption(role);
  const created = page.waitForResponse(response => response.url().endsWith('/api/auth/register'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  return email;
}

test('form validation gives accessible errors without submitting invalid fields', async ({ page }) => {
  let submissions = 0;
  page.on('request', request => { if (request.url().endsWith('/api/auth/register')) submissions++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Please enter your name.');
  await page.getByLabel('Name', { exact: true }).fill('Alex');
  await page.getByLabel('Email', { exact: true }).fill('invalid-email');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Please enter a valid email address.');
  await page.getByLabel('Email', { exact: true }).fill('valid@example.com');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Use a password of 10–128 characters.');
  expect(submissions).toBe(0);
});

test('expired sessions return to login and allow signing in again', async ({ page, context }) => {
  const email = await register(page);
  await expect(page.getByRole('heading', { name: 'Upload and parse your resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Alex Student');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Save and confirm changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Your session has expired. Please sign in again.');
  await expect(page.getByRole('button', { name: 'Profile', exact: true })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Upload and parse your resume' })).toBeVisible();
  await expect(page.getByText('Your session has expired. Please sign in again.')).toHaveCount(0);
});

test('failed logout displays a retryable error and preserves the signed-in view', async ({ page }) => {
  await register(page, 'Recruiter');
  await page.route('**/api/auth/logout', route => route.abort());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Could not connect to JobSwipe. Please try again.');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('register, reload, logout and log back in to the same personal account', async ({ page, context }) => {
  const email = await register(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Upload and parse your resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Alex Student');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name === 'jobswipe_session')).toBe(false);
  expect((await context.request.get('/api/profile')).status()).toBe(401);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Alex Student');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
});

test('duplicate registration and incorrect credentials show errors and allow recovery', async ({ page }) => {
  const email = await register(page, 'Recruiter');
  await expect(page.getByRole('heading', { name: 'Applicant dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Duplicate');
  await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('An account with that email already exists.');
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  await page.getByLabel('Email', { exact: true }).fill('unknown-auth@example.com');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Applicant dashboard' })).toBeVisible();
});

test('sign-in displays rate-limit and network errors without losing the form', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('valid@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.route('**/api/auth/login', route => route.fulfill({ status: 429, json: { error: 'Too many sign-in attempts. Wait a minute.' } }));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Too many sign-in attempts. Wait a minute.');
  await page.unroute('**/api/auth/login');
  await page.route('**/api/auth/login', route => route.abort());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not connect to JobSwipe. Please try again.');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('valid@example.com');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('pending registration disables input and prevents duplicate submissions', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let submissions = 0;
  await page.route('**/api/auth/register', async route => { submissions++; await pending; await route.continue(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Alex Student');
  await page.getByLabel('Email', { exact: true }).fill(`pending-${randomUUID()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Please wait…', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
  await page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await expect.poll(() => submissions).toBe(1);
  release();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('session restoration connection failures offer a working retry', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('Could not connect to JobSwipe. Please try again.');
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

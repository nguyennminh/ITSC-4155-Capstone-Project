import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';

// UI-only provider/API doubles. API tests separately exercise signed tokens,
// identity persistence and sessions. Production contains no test bypass.
async function googleFixture(page, options = {}) {
  let currentUser = null;
  let registeredUser = options.existing ? {
    id: 42, email: 'google@example.com', role: 'Recruiter', confirmed: true,
    profile: { ...emptyProfile, name: 'Existing Recruiter', email: 'google@example.com' },
  } : null;
  let failure = options.failure;
  const script = `window.google = { accounts: { id: {
    initialize(config) { this.config = config; },
    renderButton(element) {
      element.replaceChildren();
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Continue with Google';
      button.onclick = () => {
        if (window.cancelGooglePopup) { window.cancelGooglePopup = false; return; }
        this.config.callback({ credential: 'fictional-test-credential' });
      };
      element.append(button);
    }
  } } };`;
  await page.route('https://accounts.google.com/gsi/client', route => {
    if (failure === 'script') { failure = null; return route.abort(); }
    return route.fulfill({ contentType: 'text/javascript', body: script });
  });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: currentUser } }));
  for (const [path, data] of [['resumes/latest', { draft: null }], ['resumes', { resume: null }], ['saved-jobs', { savedJobs: [] }], ['applications', { applications: [] }]]) {
    await page.route(`**/api/${path}`, route => route.fulfill({ status: currentUser ? 200 : 401,
      json: currentUser ? data : { error: 'Sign in again.' } }));
  }
  await page.route('**/api/auth/logout', route => { currentUser = null; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/auth/google/start', route => route.fulfill({ json: { enabled: true, clientId: 'fictional-client', nonce: 'fictional-nonce' } }));
  await page.route('**/api/auth/google', route => {
    expect(route.request().postDataJSON()).toEqual({ credential: 'fictional-test-credential' });
    if (failure === 'network') { failure = null; return route.abort(); }
    if (failure === 'provider') { failure = null; return route.fulfill({ status: 503, json: { error: 'Google sign-in is temporarily unavailable. Please retry.' } }); }
    if (registeredUser && !options.existing) {
      currentUser = registeredUser;
      return route.fulfill({ json: { user: currentUser } });
    }
    return route.fulfill({ status: 202, json: { nextStep: options.existing ? 'confirm_password' : 'complete_profile', email: 'google@example.com', name: 'Google User' } });
  });
  await page.route('**/api/auth/google/complete', route => {
    if (failure === 'expired') { failure = null; return route.fulfill({ status: 401, json: { error: 'Google sign-in expired. Please start again.' } }); }
    const body = route.request().postDataJSON();
    if (options.existing && body.password !== 'existing-password') {
      return route.fulfill({ status: 401, json: { error: 'Incorrect email or password.' } });
    }
    if (!options.existing) registeredUser = { id: 42, email: 'google@example.com', role: body.role, confirmed: false,
      profile: { ...emptyProfile, name: body.name, email: 'google@example.com' } };
    currentUser = registeredUser;
    return route.fulfill({ json: { user: currentUser } });
  });
}

for (const role of ['Job seeker', 'Recruiter']) {
  test(`Google registration supports ${role}, restoration, logout and returning sign-in`, async ({ page }) => {
    await googleFixture(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    const google = page.getByRole('region', { name: 'Google sign-in' });
    await expect(google.getByLabel('Name', { exact: true })).toHaveValue('Google User');
    await google.getByRole('combobox', { name: 'Role', exact: true }).selectOption(role);
    await google.getByRole('button', { name: 'Finish Google registration', exact: true }).click();
    const destination = role === 'Recruiter' ? 'Applicant dashboard' : 'Upload and parse your resume';
    await expect(page.getByRole('heading', { name: destination })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: destination })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await expect(page.getByRole('heading', { name: destination })).toBeVisible();
  });
}

test('Google linking requires password confirmation and supports recovery', async ({ page }) => {
  await googleFixture(page, { existing: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Link your existing account' })).toBeVisible();
  await page.getByLabel('Existing password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Link Google and sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
  await page.getByLabel('Existing password', { exact: true }).fill('existing-password');
  await page.getByRole('button', { name: 'Link Google and sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Applicant dashboard' })).toBeVisible();
});

test('popup and profile cancellation leave password sign-in usable', async ({ page }) => {
  await googleFixture(page);
  await page.goto('/');
  await page.evaluate(() => { window.cancelGooglePopup = true; });
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel Google sign-in', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
});

for (const failure of ['script', 'provider', 'network']) {
  test(`Google ${failure} errors allow retry and preserve password sign-in`, async ({ page }) => {
    await googleFixture(page, { failure });
    await page.goto('/');
    if (failure !== 'script') await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Restart Google sign-in', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Complete your Google account' })).toBeVisible();
  });
}

test('expired completion can restart without triggering global session expiry', async ({ page }) => {
  await googleFixture(page, { failure: 'expired' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await page.getByRole('button', { name: 'Finish Google registration', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Google sign-in expired. Please start again.');
  await page.getByRole('button', { name: 'Cancel Google sign-in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await page.getByRole('button', { name: 'Finish Google registration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Upload and parse your resume' })).toBeVisible();
});

test('pending Google completion disables controls and prevents duplicate submissions', async ({ page }) => {
  await googleFixture(page);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let submissions = 0;
  await page.route('**/api/auth/google/complete', async route => { submissions++; await pending; await route.fallback(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  const google = page.getByRole('region', { name: 'Google sign-in' });
  try {
    await google.getByRole('button', { name: 'Finish Google registration', exact: true }).click();
    await expect(google.getByLabel('Name', { exact: true })).toBeDisabled();
    await expect(google.getByRole('button', { name: 'Please wait…', exact: true })).toBeDisabled();
    await google.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await expect.poll(() => submissions).toBe(1);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Upload and parse your resume' })).toBeVisible();
});

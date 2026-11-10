import { test, expect } from '@playwright/test';
import { fillApplication, importProfile } from '../extension/page-actions.js';
import { extraFields, selections } from '../extension/settings.js';

const listing = 'https://job-boards.greenhouse.io/example/jobs/123';
const form = `
<form>
  <label>First name <input id="first_name" required></label>
  <label>Last name <input id="last_name" required></label>
  <label>Email <input id="email" type="email" required></label>
  <label>Phone <input id="phone" type="tel" value="555-0100"></label>
  <label>LinkedIn Profile <input id="linkedin" type="url"></label>
  <div class="file-upload">Résumé <input id="resume" type="file" accept=".pdf" style="display:none"></div>
  <label for="gender">How would you describe your gender?</label>
  <div class="select__control"><input id="gender" role="combobox" aria-expanded="false" aria-required="true"></div>
  <label for="veteran">Are you a protected veteran?</label>
  <select id="veteran"><option value="">Select</option><option>No</option></select>
  <label>Why do you want this job?<textarea required></textarea></label>
</form>
<script>
  const input = document.querySelector('#gender');
  input.addEventListener('keyup', event => {
    if (event.code !== 'ArrowDown') return;
    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    list.id = 'gender-menu';
    list.innerHTML = '<div role="option">I identify as a man</div><div role="option">Woman</div>';
    list.addEventListener('click', event => {
      const selected = document.createElement('span');
      selected.className = 'select__single-value';
      selected.textContent = event.target.textContent;
      input.before(selected);
      list.remove();
      input.setAttribute('aria-expanded','false');
    });
    input.after(list);
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded','true');
  });
  document.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    window.didSubmit = true;
  });
</script>`;

test('imports only confirmed JobSwipe contact fields and an explicitly requested résumé', async ({ page }) => {
  await page.route('**/api/profile', route => route.fulfill({ json: {
    user: { confirmed: true, profile: { name: 'Test Applicant', email: 'test@example.org', phone: '555-0000', skills: 'private' } },
  } }));
  await page.route('**/api/resumes/file', route => route.fulfill({
    contentType: 'application/pdf', body: '%PDF-test',
    headers: { 'Content-Disposition': "attachment; filename*=UTF-8''sample.pdf" },
  }));
  await page.goto('/');
  const href = page.url();
  const profile = { name: 'Test Applicant', email: 'test@example.org', phone: '555-0000' };
  expect(await page.evaluate(importProfile, { href, includeResume: false })).toEqual({ profile });
  const result = await page.evaluate(importProfile, { href, includeResume: true });
  expect(result).toEqual({ profile, resume: { name: 'sample.pdf', type: 'application/pdf', content: btoa('%PDF-test') } });
});

test('fills an approved Greenhouse-style dropdown, attaches the file, and reports required blanks without submitting', async ({ page }) => {
  await page.route(listing, route => route.fulfill({ contentType: 'text/html', body: form }));
  await page.goto(listing);
  const input = {
    href: listing, profile: { name: 'Test Applicant', email: 'test@example.org', phone: '555-0000' },
    extras: extraFields.filter(field => field.key === 'linkedin').map(field => ({ ...field, value: 'https://www.linkedin.com/in/example' })),
    resume: { name: 'sample.pdf', type: 'application/pdf', content: btoa('%PDF-test') },
    answers: selections({ gender: 'Man / Male', veteran: 'I am not a protected veteran' }),
  };
  const result = await page.evaluate(fillApplication, input);
  expect(result.filled).toEqual(['First name', 'Last name', 'Email', 'LinkedIn profile URL', 'Résumé', 'Gender', 'Protected veteran status']);
  await expect(page.locator('#phone')).toHaveValue('555-0100');
  await expect(page.locator('#veteran')).toHaveValue('No');
  expect(result.missing).toContainEqual({ label: 'Why do you want this job?', required: true });
  expect(await page.locator('#resume').evaluate(control => control.files[0].text())).toBe('%PDF-test');
  expect(await page.evaluate(() => Boolean(window.didSubmit))).toBe(false);

  await page.reload();
  const skipped = await page.evaluate(fillApplication, { ...input, resume: undefined, answers: [] });
  expect(skipped.missing.map(field => field.label)).toContain('Résumé / CV');
  await expect(page.locator('#veteran')).toHaveValue('');
});

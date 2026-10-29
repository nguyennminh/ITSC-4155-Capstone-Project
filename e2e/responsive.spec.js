import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';
for (const width of [320,390,768,1280]) test(`main pages fit at ${width}px`,async ({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  async function fits() { expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await fits();
  const email=`responsive-${width}-${Date.now()}@example.org`;
  await page.request.post('/api/auth/register',{data:{name:'Layout Tester',email,password:'layout-test-password'}});
  await page.request.post('/api/profile/confirm',{data:{confirmed:true,profile:{...emptyProfile,name:'Layout Tester',email,skills:'React, SQL'}}});
  await page.request.post('/api/saved-jobs',{data:{jobId:'3'}});
  await page.request.post('/api/applications/start',{data:{jobId:'1'}});
  await page.reload();
  for (const name of ['Profile','Saved Jobs','Applications','Discover']) {
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('h1')).toBeVisible(); await fits();
    const navigationButton = page.getByRole('button',{name,exact:true});
    await navigationButton.focus();await expect(navigationButton).toBeFocused();
    await page.keyboard.press('Tab');
    const keyboardTarget=page.locator(':focus');await expect(keyboardTarget).toBeVisible();
    expect(await keyboardTarget.evaluate(element => { const style=getComputedStyle(element); return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth)>0; })).toBe(true);
    if (name==='Saved Jobs') await expect(page.locator('.job-card')).toHaveCount(1);
    if (name==='Applications') await expect(page.getByLabel('Status')).toHaveValue('Started');
  }
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Rank jobs with Gemini'}).click();
  await expect(page.locator('.job-card')).toBeVisible(); await fits();
  await page.getByRole('button',{name:'View details'}).click();await expect(page.getByRole('dialog')).toBeVisible();await fits();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Parse / review resume information'}).click();
  await page.getByLabel('Select your resume').setInputFiles('test/fixtures/resume.docx');
  await page.getByRole('button',{name:'Parse resume',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review your resume information'})).toBeVisible();await fits();
});

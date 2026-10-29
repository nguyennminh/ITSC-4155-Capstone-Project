import { test, expect } from '@playwright/test';
import { emptyProfile } from '../src/data/mockData.js';
async function setup(page) {
  await page.goto('/');
  const email=`swipe-${Date.now()}@example.org`;
  const created=await page.request.post('/api/auth/register',{data:{name:'Swipe Tester',email,password:'swipe-test-password'}});
  expect(created.status()).toBe(201);
  await page.request.post('/api/profile/confirm',{data:{confirmed:true,profile:{...emptyProfile,name:'Swipe Tester',email,skills:'React, SQL'}}});
  await page.reload();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Rank jobs with Gemini'}).click();
  await expect(page.locator('.job-card h2')).toHaveText('Frontend Developer');
  return email;
}
test('save failure retains the card; retry saves once; skips survive navigation',async ({page})=>{
  await setup(page);
  await page.route('**/api/saved-jobs',route=>route.request().method()==='POST' ? route.fulfill({status:503,json:{error:'Test database unavailable'}}):route.continue());
  await page.getByRole('button',{name:'Save job',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Job could not be saved');
  await expect(page.locator('.job-card h2')).toHaveText('Frontend Developer');
  await page.unroute('**/api/saved-jobs');
  await page.getByRole('region',{name:'Current recommended job'}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.job-card h2')).not.toHaveText('Frontend Developer');
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.getByRole('button',{name:'Saved Jobs',exact:true}).click();
  await expect(page.locator('.job-card h2')).toHaveText('Frontend Developer');
  await page.getByRole('button',{name:'Discover',exact:true}).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Rank jobs with Gemini'}).click();
  await expect(page.locator('.job-card h2')).toHaveText('Data Engineering Intern');
});
test('mouse drag right saves while a vertical drag leaves the card in place',async ({page})=>{
  await setup(page);
  const title=page.locator('.job-card h2');
  await title.evaluate(element => element.scrollIntoView({block:"center"}));
  let box=await title.boundingBox();
  await page.mouse.move(box.x+15,box.y+10);await page.mouse.down();await page.mouse.move(box.x+20,box.y+120);await page.mouse.up();
  await expect(title).toHaveText('Frontend Developer');
  box=await title.boundingBox();
  await page.mouse.move(box.x+15,box.y+10);await page.mouse.down();await page.mouse.move(box.x+140,box.y+15,{steps:8});await page.mouse.up();
  await expect(title).not.toHaveText('Frontend Developer');
});

test('touch swipe right saves the current recommendation',async ({page})=>{
  await setup(page);
  const title=page.locator('.job-card h2');
  await title.evaluate(element=>element.scrollIntoView({block:'center'}));
  const box=await title.boundingBox();
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+15,y:box.y+10}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+140,y:box.y+12}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(title).not.toHaveText('Frontend Developer');
  await session.detach();
});


test('skip history and saved listings stay with the authenticated account',async ({page})=>{
  const firstEmail=await setup(page);
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await expect(page.locator('.job-card h2')).toHaveText('Junior Software Engineer');
  await page.getByRole('button',{name:'Save job',exact:true}).click();
  await expect(page.locator('.job-card h2')).toHaveText('Data Engineering Intern');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await setup(page);
  await page.getByRole('button',{name:'Saved Jobs',exact:true}).click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill(firstEmail);
  await page.getByLabel('Password',{exact:true}).fill('swipe-test-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Discover jobs',exact:true}).waitFor();
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Rank jobs with Gemini'}).click();
  await expect(page.locator('.job-card h2')).toHaveText('Data Engineering Intern');
});

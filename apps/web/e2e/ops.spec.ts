import { expect, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/** Phase 7a1: the public crawler page, robots.txt and the operator health page. The agency-admin 404 on `/platform/health` is in platform.spec.ts (ROUTES). */
const BOT_UA = 'Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.app/bot)';

test('signed-out /bot shows RivalMondayBot and the exact UA', { tag: ['@ops'] }, async ({ page }) => {
  const res = await page.goto('/bot');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/bot$/);
  await expect(page.getByRole('heading', { name: 'RivalMondayBot', level: 1 })).toBeVisible();
  await expect(page.getByText(BOT_UA, { exact: true })).toBeVisible();
});

test('/robots.txt has Allow: /bot and Disallow: /', { tag: ['@ops'] }, async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const lines = (await res.text()).split('\n').map((l) => l.trim());
  expect(lines).toContain('Allow: /bot');
  expect(lines).toContain('Disallow: /');
});

test('operator sees Worker, Queues, Vendors and Sources', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
  try {
    const page = await context.newPage();
    const res = await page.goto('/platform/health');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Health', exact: true, level: 1 })).toBeVisible();
    for (const name of ['Worker', 'Queues', 'Vendors', 'Sources']) {
      await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

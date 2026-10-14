import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { createDb } from '@cs/db';
import { sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';

/**
 * Phase 8c platform costs. `admin@e2e.test` is a platform owner (PLATFORM_ADMIN_EMAILS); `staff@e2e.test` is invited to
 * the house agency by the seed and gets a `platform_admin` staff row here. The seed gives DataForSEO snapshots
 * (a service counts as configured once the worker has written one) with a balance of $8.20 under its $10 threshold, so the Low strip shows.
 * The worker job is never processed in E2E and no vendor key is needed.
 */
const STAFF_STATE = fileURLToPath(new URL('../test-results/support-staff-state.json', import.meta.url)); // shared with support.spec.ts
const STAFF = 'staff@e2e.test';
const NAME = 'E2E Domain Renewal';

async function ensureStaffState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (!existsSync(STAFF_STATE)) {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await signIn(page, STAFF);
      await expect(page).toHaveURL(/\/agency$/);
      await context.storageState({ path: STAFF_STATE });
    } finally {
      await context.close();
    }
  }
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    await db.execute(sql`
      insert into platform_admin (user_id, role, created_by)
      select id, 'staff', 'e2e-costs' from auth."user" where email = ${STAFF}
      on conflict do nothing`);
  } finally {
    await close();
  }
}

async function as<T>(browser: Browser, testInfo: TestInfo, state: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: state });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

const card = (page: Page, title: string) => page.getByRole('heading', { name: title, exact: true }).locator('xpath=..');
const dollars = async (page: Page, title: string) => Number((await card(page, title).innerText()).match(/\$([\d,]+\.\d{2})/)![1]!.replace(/,/g, ''));

test.describe.serial('platform costs', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    await ensureAdminState(browser, testInfo);
    await ensureStaffState(browser, testInfo);
  });

  test('owner sees services, summary and the low strip', { tag: ['@costs'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      const res = await page.goto('/platform/costs');
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Platform costs', exact: true })).toBeVisible();
      for (const title of ['Spent this month', 'Projected this month', 'Warnings']) await expect(card(page, title)).toBeVisible();
      await expect(card(page, 'Warnings')).toContainText('1');
      const row = page.getByRole('row', { name: /DataForSEO/ });
      await expect(row).toContainText('Low');
      await expect(row).toContainText('$8.20');
      await expect(page.getByRole('row', { name: /OpenRouter/ })).toContainText('Not configured');
      await expect(page.getByRole('row', { name: /E2E Vercel Pro/ })).toContainText('Monthly');
      const strip = page.getByRole('region', { name: 'Low balance warning' });
      await expect(strip).toContainText(/DataForSEO balance low: \$8\.20/);
      await expect(strip.getByRole('link', { name: 'View costs →' })).toHaveAttribute('href', '/platform/costs');
      await expect(page.getByRole('link', { name: 'Costs', exact: true })).toBeVisible();
    });
  });

  test('owner adds a monthly cost; it appears in the table and the Spent card; archive removes it from the table', { tag: ['@costs'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await page.goto('/platform/costs');
      const before = await dollars(page, 'Spent this month');
      await page.getByRole('button', { name: 'Add cost' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name').fill(NAME);
      await dialog.getByLabel('Amount (USD)').fill('300');
      await dialog.getByRole('button', { name: 'Save' }).click();
      // A successful save closes the dialog (so a second click cannot add a duplicate).
      await expect(dialog).toBeHidden();
      const row = page.getByRole('row', { name: new RegExp(NAME) });
      await expect(row).toBeVisible();
      await expect(row).toContainText('Monthly');
      await expect(row).toContainText('$300.00');
      await expect.poll(() => dollars(page, 'Spent this month')).toBeGreaterThan(before);

      await page.getByRole('button', { name: `Archive ${NAME}` }).click();
      await expect(page.getByText(`Archive ${NAME}?`)).toBeVisible();
      await expect(page.getByText('It stays in past months’ totals.')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(page.getByRole('row', { name: new RegExp(NAME) })).toHaveCount(0);
      // Archiving does not rewrite history: the month it was spent in keeps its cost, so the Spent card is not asserted here.
    });
  });

  test('staff operator gets 404 on /platform/costs and no Costs nav', { tag: ['@costs'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, STAFF_STATE, async (page) => {
      const ok = await page.goto('/platform');
      expect(ok?.status()).toBe(200);
      await expect(page.getByRole('link', { name: 'Costs', exact: true })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Low balance warning' })).toHaveCount(0);
      const res = await page.goto('/platform/costs');
      expect(res?.status()).toBe(404);
    });
  });

  test('Refresh now shows the queued message', { tag: ['@costs'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await page.goto('/platform/costs');
      await page.getByRole('button', { name: 'Refresh now' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Refreshing — figures update in a minute.' })).toBeVisible();
    });
  });
});

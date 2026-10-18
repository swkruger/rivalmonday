import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { agency, createDb } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { eq, sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';

/**
 * Phase 8a platform console. `admin@e2e.test` is an agency admin AND a platform operator (PLATFORM_ADMIN_EMAILS);
 * `plain-admin@e2e.test` is an agency admin of the same agency who is not an operator.
 */
const PLAIN_STATE = fileURLToPath(new URL('../test-results/plain-admin-state.json', import.meta.url));
const PLAIN = 'plain-admin@e2e.test';
const ROUTES = ['/platform', '/platform/agencies', '/platform/health'] as const;

async function ensurePlainState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(PLAIN_STATE)) return;
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [a] = await db.select({ id: agency.id }).from(agency).where(eq(agency.name, 'E2E Agency'));
    await createInvitation(db, { agencyId: a!.id, email: PLAIN, role: 'agency_admin', invitedBy: 'e2e-platform' });
  } finally {
    await close();
  }
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, PLAIN);
  await expect(page).toHaveURL(/\/agency$/);
  await context.storageState({ path: PLAIN_STATE });
  await context.close();
}

async function as<T>(browser: Browser, testInfo: TestInfo, state: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: state });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe.serial('platform console', () => {
  let agencyId = '';
  let agencyName = '';

  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await ensurePlainState(browser, testInfo);
  });

  test('the operator sees the overview tiles', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      const res = await page.goto('/platform');
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible();
      for (const title of ['Agencies', 'Active clients', 'Weekly active users', 'Spend this month']) {
        await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
      }
    });
  });

  test('the operator opens the first agency from the list and its detail renders', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await page.goto('/platform/agencies');
      await expect(page.getByRole('heading', { name: 'Agencies', exact: true })).toBeVisible();
      const first = page.locator('a[href^="/platform/agencies/"]').first();
      agencyName = (await first.innerText()).trim();
      await first.click();
      await expect(page).toHaveURL(/\/platform\/agencies\/[0-9a-f-]{36}$/);
      agencyId = page.url().split('/').pop()!;
      await expect(page.getByRole('heading', { name: agencyName, exact: true })).toBeVisible();
      await expect(page.getByText('Agency management is coming soon.', { exact: true })).toBeVisible();
    });
  });

  test("opening the detail left a platform_ row in that agency's audit trail", { tag: ['@platform'] }, async () => {
    expect(agencyId).not.toBe('');
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await expect
        .poll(async () => {
          const rows = [...(await db.execute<{ n: number }>(sql`
            select count(*)::int as n from audit_log
            where agency_id = ${agencyId}::uuid and tool = 'get_platform_agency' and role like 'platform\_%'`))];
          return rows[0]?.n ?? 0;
        })
        .toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  test('a plain agency admin gets 404 on the platform pages', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, PLAIN_STATE, async (page) => {
      for (const route of [...ROUTES, `/platform/agencies/${agencyId || '00000000-0000-0000-0000-000000000000'}`]) {
        const res = await page.goto(route);
        expect(res?.status(), route).toBe(404);
      }
    });
  });
});

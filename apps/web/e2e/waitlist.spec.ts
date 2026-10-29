import { createDb, platformSetting } from '@cs/db';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { WAITLIST_AGENCY, WAITLIST_BUSINESS } from './seed';

/**
 * Phase 17a pilot waitlist. The operator (`admin@e2e.test`) reuses the shared admin storage state. `pilot_mode` has no row
 * in the seeded database (off); the one test that turns it on removes the row again in `finally`.
 */
test.describe.serial('pilot waitlist', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
  });

  test('the operator invites the waitlisted agency and sees the business', { tag: ['@waitlist', '@platform'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
    try {
      const page = await context.newPage();
      const res = await page.goto('/platform/waitlist');
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Waitlist', exact: true, level: 1 })).toBeVisible();
      // Both seeded rows: the agency on this tab, the business on its own tab.
      await expect(page.getByText(WAITLIST_AGENCY, { exact: true })).toBeVisible();
      await page.getByRole('checkbox', { name: `Select ${WAITLIST_AGENCY}` }).check();
      await page.getByRole('button', { name: 'Send trial invite' }).click();
      await expect(page.getByText(/Invited 1\./)).toBeVisible();

      await page.getByRole('link', { name: /^Businesses/ }).click();
      await expect(page).toHaveURL(/tab=businesses/);
      await expect(page.getByText(WAITLIST_BUSINESS, { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('an unknown sample link is a 404', { tag: ['@waitlist'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const res = await page.goto('/sample/not-a-token');
      expect(res?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test('sign-up shows the pilot message while pilot mode is on', { tag: ['@waitlist'] }, async ({ browser }, testInfo) => {
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      await db.insert(platformSetting).values({ key: 'pilot_mode', value: { on: true }, updatedBy: 'e2e' }).onConflictDoUpdate({ target: platformSetting.key, set: { value: { on: true } } });
      const page = await context.newPage();
      await page.goto('/sign-up');
      await expect(page.getByText('Rival Monday is in pilot')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Join the waitlist' })).toBeVisible();
    } finally {
      await db.delete(platformSetting).where(eq(platformSetting.key, 'pilot_mode'));
      await context.close();
      await close();
    }
  });

  test('the waitlist endpoint refuses a disallowed origin', { tag: ['@waitlist'] }, async ({ request }) => {
    const res = await request.post('/api/waitlist', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: { kind: 'agency', turnstileToken: 'x' },
    });
    expect(res.status()).toBe(403);
  });
});

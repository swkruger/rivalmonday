import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { createDb, agency, client } from '@cs/db';
import { eq } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { CB_CLIENT, CB_USERS } from './seed';

/**
 * Profile page (`/settings/profile`). The agency admin reuses the shared admin session; the client owner reuses the
 * client-billing owner's stored session (same file, signed in once per run if no earlier spec saved it), so no extra
 * magic link is requested.
 */
const OWNER_STATE = fileURLToPath(new URL('../test-results/client-billing-owner-state.json', import.meta.url));

// A 1x1 PNG: square, so the 256 px centre crop accepts it.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

async function asOwner<T>(browser: Browser, testInfo: TestInfo, fn: (page: Page) => Promise<T>): Promise<T> {
  if (!existsSync(OWNER_STATE)) {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      await signIn(await ctx.newPage(), CB_USERS.owner, '/');
      await ctx.storageState({ path: OWNER_STATE });
    } finally {
      await ctx.close();
    }
  }
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: OWNER_STATE });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

async function clientId(): Promise<string> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [row] = await db.select({ id: client.id }).from(client).innerJoin(agency, eq(agency.id, client.agencyId)).where(eq(client.name, CB_CLIENT));
    return row!.id;
  } finally {
    await close();
  }
}

test.describe.serial('profile page', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
  });

  test.use({ storageState: ADMIN_STATE });

  test('agency admin: opens Profile from the menu, renames, uploads a PNG, sees the image in the top bar, removes it', { tag: ['@profile-page', '@navigation'] }, async ({ page }) => {
    await page.goto('/agency');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');

    // Rename, then restore the seeded name so other specs that read it are unaffected.
    const name = page.getByLabel('Name', { exact: true });
    const original = await name.inputValue();
    try {
      await name.fill('Renamed E2E Admin');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Renamed E2E Admin');
    } finally {
      await page.getByLabel('Name', { exact: true }).fill(original);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    }

    // Photo: upload, see it in the top bar, remove it again.
    try {
      await page.getByLabel('Photo file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Account menu' }).locator('img')).toHaveAttribute('src', /\/files\/avatar\//, { timeout: 15_000 });
    } finally {
      const remove = page.getByRole('button', { name: 'Remove', exact: true });
      if (await remove.count()) {
        await remove.click();
        await page.getByRole('dialog').getByRole('button', { name: 'Remove photo' }).click();
      }
    }
    await expect(page.getByRole('button', { name: 'Account menu' }).locator('img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  });

  test('client owner: sees the three summaries and follows Usage', { tag: ['@profile-page', '@client-billing', '@usage'] }, async ({ browser }, testInfo) => {
    const id = await clientId();
    await asOwner(browser, testInfo, async (page) => {
      await page.goto('/settings/profile');
      await expect(page.getByRole('heading', { name: 'Your business' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Business profile', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Usage', level: 3 })).toBeVisible();
      // Billing shows once the client-billing spec has turned billing on; in a lone run it is absent by design.
      if (await page.getByRole('link', { name: 'View billing' }).count()) {
        await expect(page.getByRole('link', { name: 'View billing' })).toHaveAttribute('href', `/c/${id}/settings/billing`);
      }
      expect(await page.locator('main').innerText()).not.toMatch(/rival\s*monday/i);
      await page.getByRole('link', { name: 'View usage' }).click();
      await expect(page).toHaveURL(new RegExp(`/c/${id}/settings/usage$`));
      await expect(page.getByText('Credits this month')).toBeVisible();
    });
  });

  test('/settings/notifications lands on #notifications', { tag: ['@profile-page'] }, async ({ page }) => {
    await page.goto('/settings/notifications');
    await expect(page).toHaveURL(/\/settings\/profile#notifications$/);
    await expect(page.locator('#notifications')).toBeVisible();
  });
});

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';

/** Phase 16: steps 1-2 of the client flow. Opens Add a client, fills the four required details and lands on "Find the business". */
async function detailsThenFind(page: Page, business: string): Promise<void> {
  await page.goto('/agency/clients/new');
  await page.getByLabel('Business name').fill(business);
  await page.getByLabel('Contact full name').fill('Dee Distiller');
  await page.getByLabel('Phone').fill('(830) 555-0142');
  await page.getByLabel('Email').fill('dee@distillery.example');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Step 2 of 7 · Find the business')).toBeVisible();
}

/**
 * Phase 14a acceptance path with the fake lookup and the fake drafter (fixtures `setup-lookup-distillery.json`,
 * `vertical-draft.json`): an agency drafts and creates a business type, an operator approves it, another agency's
 * lookup of a second distillery then preselects it. `admin@e2e.test` is both the first agency's admin and the operator.
 */
const OTHER_STATE = fileURLToPath(new URL('../test-results/new-vertical-other-agency-state.json', import.meta.url));
const OTHER_ADMIN = 'target-admin@e2e.test';
const TYPE_NAME = 'Craft distilleries';

async function ensureOtherState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(OTHER_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, OTHER_ADMIN);
  await expect(page).toHaveURL(/\/agency$/);
  await context.storageState({ path: OTHER_STATE });
  await context.close();
}

test.describe.serial('new business type', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await ensureOtherState(browser, testInfo);
  });

  test.describe('agency creates it', () => {
    test.use({ storageState: ADMIN_STATE });

    test('drafts a business type from the Google profile and sets up a client with its services', { tag: ['@setup', '@catalogue', '@clients'] }, async ({ page }) => {
      await detailsThenFind(page, 'Hill Country Distillery');
      await page.getByLabel('City or ZIP').fill('Fredericksburg, TX');
      await page.getByRole('button', { name: 'Find business' }).click();
      const results = page.getByRole('list', { name: 'Matching businesses' });
      await expect(results.getByRole('listitem')).toHaveCount(2);
      await results.getByRole('listitem').filter({ hasText: 'Hill Country Distillery' }).getByRole('radio').check();

      await expect(page.getByText('We don’t track this business type yet')).toBeVisible();
      await page.getByRole('button', { name: 'Draft it' }).click();
      await expect(page.getByLabel('Business type name')).toHaveValue(TYPE_NAME);
      await page.getByRole('button', { name: 'Remove Private events' }).click();
      await page.getByRole('button', { name: 'Create business type' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Created ${TYPE_NAME}` })).toBeVisible();
      await expect(page.locator('#verticalId option:checked')).toHaveText(TYPE_NAME);

      // A fresh search now preselects the new type for every distillery; the created option must exist for a second place too.
      await page.getByLabel('Business name').fill('Lone Star Spirits Distillery');
      await page.getByLabel('City or ZIP').fill('Dripping Springs, TX');
      await page.getByRole('button', { name: 'Search again' }).click();
      const again = page.getByRole('list', { name: 'Matching businesses' });
      await expect(again.getByRole('listitem')).toHaveCount(2);
      await again.getByRole('listitem').filter({ hasText: 'Lone Star Spirits Distillery' }).getByRole('radio').check();
      await expect(page.locator('#verticalId option:checked')).toHaveText(TYPE_NAME);
      await expect(page.getByText('We don’t track this business type yet')).toHaveCount(0);

      await again.getByRole('listitem').filter({ hasText: 'Hill Country Distillery' }).getByRole('radio').check();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
      // Step 3 keeps the services to one line; Review opens the list.
      await page.getByRole('button', { name: /Review/ }).click();
      const services = page.getByRole('group', { name: 'Services the business offers' });
      for (const s of ['Tasting room', 'Distillery tours', 'Bottle sales', 'Cocktail bar']) await expect(services.getByText(s)).toBeVisible();
      await expect(services.getByText('Private events')).toHaveCount(0);
    });
  });

  test.describe('operator reviews it', () => {
    test.use({ storageState: ADMIN_STATE });

    test('sees it in the queue with a badge, approves it, and the badge clears', { tag: ['@catalogue', '@platform', '@nav'] }, async ({ page }) => {
      await page.goto('/platform/verticals');
      await expect(page.getByRole('heading', { name: 'New business types' })).toBeVisible();
      const badge = page.getByRole('link', { name: /Business types/ }).first();
      // Other specs may leave pending services in the queue, so the test checks the badge goes down by one rather than to zero.
      const shown = Number(/\d+$/.exec((await badge.textContent()) ?? '')?.[0] ?? 0);
      expect(shown).toBeGreaterThanOrEqual(1);
      await expect(page.getByRole('heading', { name: new RegExp(TYPE_NAME) })).toBeVisible();
      // The innermost block holding the type's heading is its card (other specs may leave service cards in the queue).
      const card = page.locator('div', { has: page.getByRole('heading', { name: new RegExp(TYPE_NAME) }) }).last();
      await expect(card.getByText(/Added by E2E Agency · 1 client/)).toBeVisible();
      await expect(card.getByLabel('Google categories')).toContainText(/distillery/i);
      await card.getByText(/^Evidence \(/).click();
      await expect(card.getByText('“Guided distillery tours every hour”')).toBeVisible();

      await page.getByRole('button', { name: `Approve ${TYPE_NAME}` }).click();
      // 15c-2a: approving a catalogue entry is confirmed in a dialog.
      await page.getByRole('dialog', { name: `Approve ${TYPE_NAME}?` }).getByRole('button', { name: 'Approve', exact: true }).click();
      await expect(page.getByText(`Approved “${TYPE_NAME}”.`)).toBeVisible();
      await expect(page.getByRole('heading', { name: new RegExp(TYPE_NAME) })).toHaveCount(0);
      await expect(badge).toHaveText(shown > 1 ? `Business types${shown - 1}` : 'Business types');
    });
  });

  test.describe('another agency finds it', () => {
    test.use({ storageState: OTHER_STATE });

    test('looking up a second distillery preselects the approved type', { tag: ['@setup', '@catalogue', '@clients'] }, async ({ page }) => {
      await detailsThenFind(page, 'Lone Star Spirits Distillery');
      await page.getByLabel('City or ZIP').fill('Dripping Springs, TX');
      await page.getByRole('button', { name: 'Find business' }).click();
      await page.getByRole('list', { name: 'Matching businesses' }).getByRole('listitem').filter({ hasText: 'Lone Star Spirits Distillery' }).getByRole('radio').check();
      await expect(page.locator('#verticalId option:checked')).toHaveText(TYPE_NAME);
      await expect(page.getByText('We don’t track this business type yet')).toHaveCount(0);
    });
  });
});

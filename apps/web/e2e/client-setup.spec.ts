import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { SETUP_FIXTURE_FILE } from '../playwright.config';
import { SETUP_OWNER_EMAIL, type SetupFixture } from './seed';

/**
 * Phase 11a on seeded data (no worker runs in E2E, so every seeded setup already has a done discovery run and tiered
 * suggestions). Only the lookup spec creates its client through the UI (fake lookup, 3 places).
 */
const OWNER_STATE = fileURLToPath(new URL('../test-results/setup-owner-state.json', import.meta.url));
const fx = (): SetupFixture => JSON.parse(readFileSync(SETUP_FIXTURE_FILE, 'utf8')) as SetupFixture;

/** The setup owner owns two seeded clients; one shared sign-in per run (Better Auth's per-IP magic-link limit). */
async function ensureOwnerState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(OWNER_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, SETUP_OWNER_EMAIL, `/c/${fx().owner.id}`);
  await expect(page).toHaveURL(new RegExp(`/c/${fx().owner.id}$`));
  await context.storageState({ path: OWNER_STATE });
  await context.close();
}

test.beforeAll(async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
  await ensureOwnerState(browser, testInfo);
});

test.describe('agency staff', () => {
  test.use({ storageState: ADMIN_STATE });

  test('staff finds a business and lands in setup', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    await page.goto('/agency/clients/new');
    await page.getByLabel('Business name').fill('Granbury Park Dental');
    await page.getByLabel('City and state, or ZIP').fill('Granbury, TX');
    await page.getByRole('button', { name: 'Find business' }).click();
    const results = page.getByRole('list', { name: 'Matching businesses' });
    await expect(results.getByRole('listitem')).toHaveCount(3);
    await results.getByRole('button', { name: /Granbury Park Dental/ }).click();
    await page.getByRole('button', { name: 'Create client' }).click();

    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    const stepper = page.getByRole('list', { name: 'Setup steps' });
    await expect(stepper.getByText('Your business')).toBeVisible();
    await expect(page.getByText('Reading your Google profile…')).toBeVisible();
  });

  test('staff finishes setup', { tag: ['@setup', '@clients', '@overview'] }, async ({ page }) => {
    const { id } = fx().finish;
    await page.goto(`/c/${id}`);
    await expect(page.getByRole('link', { name: /Finish setup · \d of 3/ })).toBeVisible();

    await page.goto(`/c/${id}/setup`);
    for (const tier of ['Top rival', 'Worth watching', 'Minor']) await expect(page.getByRole('group', { name: tier })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Setup Rival One Plumbing' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Rival Two Plumbing' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Watch Plumbing' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Minor Plumbing' })).not.toBeChecked();

    await page.getByRole('button', { name: 'Done picking' }).click();
    await expect(page.getByRole('heading', { name: 'Setup finished' })).toBeVisible();

    await page.goto(`/c/${id}`);
    await expect(page.getByRole('heading', { name: fx().finish.name })).toBeVisible();
    await expect(page.getByRole('link', { name: /Finish setup/ })).toHaveCount(0);
    // Picking had an effect: the two ticked top rivals are tracked, the unticked ones are not.
    await page.goto(`/c/${id}/competitors`);
    const tracked = page.getByRole('table');
    await expect(tracked.getByRole('link', { name: 'Setup Rival One Plumbing' })).toBeVisible();
    await expect(tracked.getByRole('link', { name: 'Setup Rival Two Plumbing' })).toBeVisible();
    await expect(tracked.getByRole('link', { name: 'Setup Watch Plumbing' })).toHaveCount(0);
  });

  test('portfolio shows Finish setup badge for an open setup', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    const { id, name } = fx().badge;
    await page.goto('/agency');
    const badge = page.locator(`a[href="/c/${id}/setup"]`).first(); // the portfolio renders each row in two layouts
    await expect(badge).toHaveText(/Finish setup · \d of 3/);
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    // A finished setup (the seeded closed one) shows none.
    await expect(page.locator(`a[href="/c/${fx().closed.id}/setup"]`)).toHaveCount(0);
  });
});

test.describe('client owner', () => {
  test.use({ storageState: OWNER_STATE });

  test('client owner edits profile and picks competitors', { tag: ['@setup'] }, async ({ page }) => {
    const { id } = fx().owner;
    await page.goto(`/c/${id}/setup`);
    // Ready Google suggestions arrive pre-ticked.
    await expect(page.getByRole('checkbox', { name: 'AC repair', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'ac repair near me' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Dismiss setup' })).toHaveCount(0);

    await page.getByLabel('Add your own (one per line)').fill('emergency furnace repair');
    await page.getByLabel('Map centre (latitude, longitude)').fill('32.4, -97.79');
    await page.getByLabel('Radius (km)').fill('20');
    await page.getByLabel('ZIP codes served').fill('76048');
    await page.getByLabel('Google place id').fill('e2e-setup-owner-place');
    await page.getByRole('button', { name: 'Save and find competitors' }).click();

    // The profile is complete and a search already ran, so the wizard moves on to picking.
    await expect(page.getByRole('heading', { name: 'Pick competitors' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Owner Rival Heating' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Owner Watch Heating' })).not.toBeChecked();
    await page.getByRole('button', { name: 'Done picking' }).click();
    // The setup is closed: a client owner can't open it any more, so they land on the overview, with the pick tracked.
    await expect(page).toHaveURL(new RegExp(`/c/${id}$`));
    await expect(page.getByRole('heading', { name: fx().owner.name })).toBeVisible();
    await expect(page.getByRole('link', { name: /Finish setup/ })).toHaveCount(0);
    await page.goto(`/c/${id}/competitors`);
    await expect(page.getByRole('table').getByRole('link', { name: 'Owner Rival Heating' })).toBeVisible();
    await expect(page.getByRole('table').getByRole('link', { name: 'Owner Watch Heating' })).toHaveCount(0);
  });

  test('client owner gets 404 on a finished setup', { tag: ['@setup'] }, async ({ page }) => {
    const response = await page.goto(`/c/${fx().closed.id}/setup`);
    expect(response?.status()).toBe(404);
  });
});

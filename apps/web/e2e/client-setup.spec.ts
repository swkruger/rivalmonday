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
    const granbury = results.getByRole('button', { name: /Granbury Park Dental/ });
    await expect(granbury).toContainText('Owner-verified');
    await expect(granbury).toContainText('(817) 286-3655');
    await granbury.click();
    await page.getByRole('button', { name: 'Create client' }).click();

    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    const stepper = page.getByRole('list', { name: 'Setup steps' });
    await expect(stepper.getByText('Your business')).toBeVisible();
    await expect(page.getByText('Reading your Google profile…')).toBeVisible();
  });

  test('staff adds a prospect by hand and lands in setup', { tag: ['@setup', '@prospects'] }, async ({ page }) => {
    await page.goto('/agency/prospects/new');
    await page.getByRole('button', { name: /enter details by hand/i }).click();
    await page.getByLabel('Business name').fill('By Hand Prospect Dental');
    await page.getByLabel('Business type', { exact: true }).selectOption('dental');
    await page.getByLabel(/search keywords/i).fill('dentist');
    await page.getByLabel(/map centre/i).fill('33.95, -84.33');
    await page.getByLabel(/radius/i).selectOption({ label: '10 mi' });
    await page.getByRole('button', { name: 'Create prospect' }).click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    await expect(page.getByRole('list', { name: 'Setup steps' })).toBeVisible();
  });

  test('staff finishes setup', { tag: ['@setup', '@clients', '@overview'] }, async ({ page }) => {
    const { id } = fx().finish;
    await page.goto(`/c/${id}`);
    await expect(page.getByRole('link', { name: /^Setup \d of 7$/ })).toBeVisible();

    await page.goto(`/c/${id}/setup`);
    for (const tier of ['Top rival', 'Worth watching', 'Minor']) await expect(page.getByRole('group', { name: tier })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Setup Rival One Plumbing' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Rival Two Plumbing' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Watch Plumbing' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Minor Plumbing' })).not.toBeChecked();

    await page.getByRole('button', { name: 'Done picking' }).click();
    // 11b: picking moves on to the staff-only invite step. This agency has no Stripe account, so billing is skipped by
    // itself; the setup closes once the invite is skipped.
    await expect(page.getByRole('heading', { name: 'Invite the owner' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Setup finished' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { name: 'Setup finished' })).toBeVisible();

    await page.goto(`/c/${id}`);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText(`How ${fx().finish.name} compares with its competitors this week.`).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Setup \d of \d/ })).toHaveCount(0);
    // Picking had an effect: the two ticked top rivals are tracked, the unticked ones are not.
    await page.goto(`/c/${id}/competitors`);
    const tracked = page.getByRole('table');
    await expect(tracked.getByRole('link', { name: 'Setup Rival One Plumbing' })).toBeVisible();
    await expect(tracked.getByRole('link', { name: 'Setup Rival Two Plumbing' })).toBeVisible();
    await expect(tracked.getByRole('link', { name: 'Setup Watch Plumbing' })).toHaveCount(0);
  });

  test('portfolio shows the setup badge for an open setup', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    const { id, name } = fx().badge;
    await page.goto('/agency');
    const badge = page.locator(`a[href="/c/${id}/setup"]`).first(); // the portfolio renders each row in two layouts
    await expect(badge).toHaveText(/^Setup \d of 7$/);
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    // A finished setup (the seeded closed one) shows none.
    await expect(page.locator(`a[href="/c/${fx().closed.id}/setup"]`)).toHaveCount(0);
  });
});

test.describe('client owner', () => {
  test.use({ storageState: OWNER_STATE });

  test('client owner asked to pick picks competitors', { tag: ['@setup'] }, async ({ page }) => {
    const { id } = fx().owner;
    // O12: the agency asked the owner to pick, so the pick screen is the owner's only setup surface (P8).
    await page.goto(`/c/${id}/setup`);
    await expect(page.getByRole('heading', { name: 'Pick competitors' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss setup' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Owner Rival Heating' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Owner Watch Heating' })).not.toBeChecked();
    await page.getByRole('button', { name: 'Done picking' }).click();
    // Their pick closes the window: they land on the overview, with the pick tracked, and /setup is a 404 again.
    await expect(page).toHaveURL(new RegExp(`/c/${id}$`));
    await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText(`How ${fx().owner.name} compares with its competitors this week.`).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Setup \d/ })).toHaveCount(0);
    await page.goto(`/c/${id}/competitors`);
    await expect(page.getByRole('table').getByRole('link', { name: 'Owner Rival Heating' })).toBeVisible();
    await expect(page.getByRole('table').getByRole('link', { name: 'Owner Watch Heating' })).toHaveCount(0);
  });

  test('client owner gets 404 on a finished setup', { tag: ['@setup'] }, async ({ page }) => {
    const response = await page.goto(`/c/${fx().closed.id}/setup`);
    expect(response?.status()).toBe(404);
  });
});

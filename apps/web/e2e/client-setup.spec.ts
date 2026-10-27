import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { SETUP_FIXTURE_FILE } from '../playwright.config';
import { SETUP_OWNER_EMAIL, type SetupFixture } from './seed';

/**
 * Phase 11a on seeded data (no worker runs in E2E, so every seeded setup already has a done discovery run and tiered
 * suggestions), Phase 16 for the split flow (16 §6): the specs that create a client through the UI use the fake lookup
 * (3 places) and the fixture geocoder (Austin for any city or ZIP, nothing for "nowhere").
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

/** Step 1 of the flow: the four required details. */
async function fillDetails(page: Page, o: { business: string; contact: string; phone?: string; email: string }): Promise<void> {
  await page.getByLabel('Business name').fill(o.business);
  await page.getByLabel('Contact full name').fill(o.contact);
  await page.getByLabel('Phone').fill(o.phone ?? '(817) 555-0142');
  await page.getByLabel('Email').fill(o.email);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test.describe('agency staff', () => {
  test.use({ storageState: ADMIN_STATE });

  test('staff adds a client through the seven screens: details, listing, area, competitors, invite, all set', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    await page.goto('/agency/clients/new');
    await expect(page.getByRole('heading', { name: 'Add a client', level: 1 })).toBeVisible();
    await expect(page.getByText('Step 1 of 7 · Client details')).toBeVisible();
    // The star fields are enforced before moving on.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Enter the business name.')).toBeVisible();
    await fillDetails(page, { business: 'Granbury Park Dental', contact: 'Gina Park', phone: '(817) 286-3655', email: 'gina@granburypark.example' });

    // Step 2: the search starts from what was typed in step 1.
    await expect(page.getByText('Step 2 of 7 · Find the business')).toBeVisible();
    await expect(page.getByLabel('Business name')).toHaveValue('Granbury Park Dental');
    await page.getByLabel('City or ZIP').fill('Granbury, TX');
    await page.getByRole('button', { name: 'Find business' }).click();
    const results = page.getByRole('list', { name: 'Matching businesses' });
    await expect(results.getByRole('listitem')).toHaveCount(3);
    const granbury = results.getByRole('listitem').filter({ hasText: 'Granbury Park Dental' });
    await expect(granbury).toContainText('Owner-verified');
    await expect(granbury).toContainText('(817) 286-3655');
    await granbury.getByRole('radio').check();
    // The Google category picks the business type; the preview shows the listing.
    await expect(page.locator('#verticalId')).toHaveValue('dental');
    await expect(page.getByRole('complementary', { name: 'Preview' }).getByText('Granbury Park Dental')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: seed keywords (no worker, so no Google suggestions), 10 mi by default, services collapsed.
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    await expect(page.getByText('Step 3 of 7 · What they do and where')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What they do and where', level: 1 })).toBeVisible();
    await expect(page.getByLabel('10 mi')).toBeChecked();
    await expect(page.getByLabel('City or ZIP')).toHaveCount(0);
    await page.getByText('15 mi', { exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Preview' }).getByText('15 mi', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4: no worker, so the search never finishes here; the owner can be asked to pick at any point.
    await expect(page).toHaveURL(/step=competitors/);
    await expect(page.getByRole('heading', { name: 'Pick who to watch', level: 1 })).toBeVisible();
    await expect(page.getByText('Step 4 of 7 · Competitors')).toBeVisible();
    await page.getByRole('button', { name: 'Ask the owner to pick' }).click();

    // Step 5: pre-filled from step 1; no Skip while the owner is asked to pick (P12).
    await expect(page.getByRole('heading', { name: 'Invite the owner', level: 1 })).toBeVisible();
    await expect(page.getByText('Send Gina an invite')).toBeVisible();
    await expect(page.getByText('gina@granburypark.example')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Send invite' }).click();

    // Step 7: this agency has no Stripe account, so billing is settled by itself and the flow ends on "all set", waiting on the owner.
    await expect(page.getByRole('heading', { name: 'Granbury Park Dental is all set', level: 1 })).toBeVisible();
    await expect(page.getByText('Gina picks the competitors. Everything else is ready.')).toBeVisible();
    await expect(page.getByText('Waiting on Gina to pick competitors')).toBeVisible();
    await expect(page.getByRole('img', { name: /local storefront under a map pin/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Granbury Park Dental' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add another client' })).toBeVisible();
  });

  test('client without listing reaches competitors via geocode', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    await page.goto('/agency/clients/new');
    await fillDetails(page, { business: 'Geocoded Dental Studio', contact: 'Gus Geo', email: 'gus@geocoded.example' });
    await page.getByLabel('City or ZIP').fill('Round Rock, TX');
    await page.locator('#verticalId').selectOption('dental');
    await page.getByRole('button', { name: /Continue without a listing/ }).click();

    // The typed City or ZIP was geocoded when the client was made, so step 3 does not ask for a location again.
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    await expect(page.getByRole('heading', { name: 'What they do and where', level: 1 })).toBeVisible();
    await expect(page.getByLabel('City or ZIP')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/step=competitors/);
    await expect(page.getByRole('heading', { name: 'Pick who to watch', level: 1 })).toBeVisible();
  });

  test('a place we cannot find is asked for again on step 3', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    await page.goto('/agency/clients/new');
    await fillDetails(page, { business: 'Lost Dental Studio', contact: 'Lou Lost', email: 'lou@lost.example' });
    await page.getByLabel('City or ZIP').fill('Nowhere, ZZ');
    await page.locator('#verticalId').selectOption('dental');
    await page.getByRole('button', { name: /Continue without a listing/ }).click();

    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    const city = page.getByLabel('City or ZIP');
    await expect(city).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await city.fill('Round Rock, TX');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/step=competitors/);
    await expect(page.getByRole('heading', { name: 'Pick who to watch', level: 1 })).toBeVisible();
  });

  test('staff adds a prospect through the same screens, with six steps', { tag: ['@setup', '@prospects'] }, async ({ page }) => {
    await page.goto('/agency/prospects/new');
    await expect(page.getByRole('heading', { name: 'Add a prospect', level: 1 })).toBeVisible();
    await expect(page.getByText('Step 1 of 6 · Client details')).toBeVisible();
    await fillDetails(page, { business: 'By Hand Prospect Dental', contact: 'Pru Prospect', email: 'pru@prospect.example' });
    await page.getByLabel('City or ZIP').fill('Granbury, TX');
    await page.locator('#verticalId').selectOption('dental');
    await page.getByRole('button', { name: /Continue without a listing/ }).click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
    await expect(page.getByText('Step 3 of 6 · What they do and where')).toBeVisible();
  });

  test('staff finishes setup', { tag: ['@setup', '@clients', '@overview'] }, async ({ page }) => {
    const { id, name } = fx().finish;
    await page.goto(`/c/${id}`);
    await expect(page.getByRole('link', { name: /^Setup \d of 7$/ })).toBeVisible();

    await page.goto(`/c/${id}/setup`);
    await expect(page.getByRole('heading', { name: 'Pick who to watch', level: 1 })).toBeVisible();
    for (const tier of ['Top rival', 'Worth watching', 'Minor']) await expect(page.getByText(tier, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Setup Rival One Plumbing' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Rival Two Plumbing' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Watch Plumbing' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Setup Minor Plumbing' })).not.toBeChecked();
    // The preview compares the business with the first two ticked rivals.
    const scorecard = page.getByRole('complementary', { name: 'Preview' });
    await expect(scorecard.getByText('Where you stand')).toBeVisible();
    await expect(scorecard.getByRole('region', { name: 'Rating' }).getByText('Setup Rival One Plumbing')).toBeVisible();
    await expect(scorecard.getByRole('region', { name: 'Rating' }).getByText('Setup Rival Two Plumbing')).toBeVisible();

    await page.getByRole('button', { name: 'Continue with 2' }).click();
    // 11b: picking moves on to the staff-only invite step (pre-filled from the details). This agency has no Stripe account,
    // so billing is skipped by itself; the setup closes once the invite is skipped.
    await expect(page.getByRole('heading', { name: 'Invite the owner', level: 1 })).toBeVisible();
    await expect(page.getByText('Send Fran an invite')).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { name: `${name} is all set`, level: 1 })).toBeVisible();

    await page.goto(`/c/${id}`);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText(`How ${name} compares with its competitors this week.`).first()).toBeVisible();
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

  // Phase 16 P8: owners never open /setup. Their one setup screen (picking competitors while asked to) is /setup/competitors (Task 9).
  test('client owner opening setup lands on the Overview', { tag: ['@setup'] }, async ({ page }) => {
    const { id } = fx().owner;
    const response = await page.goto(`/c/${id}/setup`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/c/${id}$`));
    await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible();
  });

  test('client owner opening a finished setup lands on the Overview too', { tag: ['@setup'] }, async ({ page }) => {
    const { closed } = fx();
    await page.goto(`/c/${closed.id}/setup`);
    await expect(page).toHaveURL(new RegExp(`/c/${closed.id}$`));
  });
});

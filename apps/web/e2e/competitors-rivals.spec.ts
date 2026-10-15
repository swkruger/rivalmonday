import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { ASK_FIXTURE_FILE, RIVALS_FIXTURE_FILE } from '../playwright.config';
import type { AskFixture, RivalsFixture } from './seed';

/**
 * Phase 12a on seeded data (no worker runs in E2E): the agency reviews tiered suggestions and tracks the pre-ticked
 * top rivals, the client user sees tiers but no suggestions panel, and an auto-matched Meta page can be removed.
 */
const OWNER_STATE = fileURLToPath(new URL('../test-results/asker-state.json', import.meta.url));
const fx = (): RivalsFixture => JSON.parse(readFileSync(RIVALS_FIXTURE_FILE, 'utf8')) as RivalsFixture;

/** The Ask client user (also a client owner of the Rivals client); one shared sign-in per run (Better Auth's per-IP limit, see helpers.ts). */
async function ensureAskerState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(OWNER_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const askCo = (JSON.parse(readFileSync(ASK_FIXTURE_FILE, 'utf8')) as AskFixture).askCo.id;
  await signIn(page, 'asker@e2e.test', `/c/${askCo}`);
  await expect(page).toHaveURL(new RegExp(`/c/${askCo}$`));
  await context.storageState({ path: OWNER_STATE });
  await context.close();
}

test.beforeAll(async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
  await ensureAskerState(browser, testInfo);
});

test.describe('agency', () => {
  test.use({ storageState: ADMIN_STATE });

  test('agency sees tier groups, pre-ticked top rivals, tracks two, hidden list opens', { tag: ['@rivals', '@competitors'] }, async ({ page }) => {
    await page.goto(`/c/${fx().clientId}/competitors`);
    for (const name of ['Top rival · 2', 'Worth watching · 1', 'Minor · 1']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText('close by, same services, active')).toBeVisible();

    // Top rivals start ticked; the others do not.
    await expect(page.getByRole('checkbox', { name: 'Track Granbury Cooling Pros' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Track Lakeview Air and Heat' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Track Hood County Comfort' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Track Comanche Peak Plumbing' })).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Track selected (2)' })).toBeVisible();

    // Unchecked signals show as "· not checked" pills, never as zero; checked-none ones say so in words.
    const watch = page.getByRole('listitem').filter({ hasText: 'Hood County Comfort' });
    await expect(watch.getByRole('img', { name: /^Reviews · not checked\. Not checked/ })).toBeVisible();
    const top = page.getByRole('listitem').filter({ hasText: 'Granbury Cooling Pros' });
    await expect(top.getByRole('img', { name: /^No Meta ads\./ })).toBeVisible();
    await expect(watch.getByText('Some signals unavailable')).toBeVisible();

    // The hidden list is closed until opened, then shows decided reason labels.
    await expect(page.getByText('Bluestem Hardware Supply')).toBeHidden();
    await page.getByText('Show 2 hidden').click();
    await expect(page.getByText('Bluestem Hardware Supply')).toBeVisible();
    await expect(page.getByText('Different kind of business')).toBeVisible();
    await expect(page.getByText('Outside your service area')).toBeVisible();

    // Track the two top rivals: they join the tracked list and leave the suggestions.
    await page.getByRole('button', { name: 'Track selected (2)' }).click();
    const tracked = page.getByRole('table');
    await expect(tracked.getByRole('link', { name: 'Granbury Cooling Pros' })).toBeVisible();
    await expect(tracked.getByRole('link', { name: 'Lakeview Air and Heat' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Track Granbury Cooling Pros' })).toHaveCount(0);
  });

  test('remove auto-matched Meta page', { tag: ['@rivals', '@competitors'] }, async ({ page }) => {
    const { clientId, trackedMetaId } = fx();
    await page.goto(`/c/${clientId}/competitors`);
    await page.getByRole('table').getByRole('link', { name: 'Brazos Valley Air' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${clientId}/competitors/[0-9a-f-]{36}$`));

    const chips = page.getByRole('list', { name: 'Ad accounts' });
    await expect(chips.getByText(`Meta ${trackedMetaId}`)).toBeVisible();
    await expect(chips.getByText('Possible Google account: Brazos Valley Air LLC')).toBeVisible();

    // Sole tracker (Ruling 7), so the shared row may be changed.
    await chips.getByRole('button', { name: `Remove Meta ${trackedMetaId}` }).click();
    await expect(page.getByText('Ad account removed.')).toBeVisible();
    await expect(chips.getByText(`Meta ${trackedMetaId}`)).toBeHidden();
    await expect(chips.getByText('Possible Google account: Brazos Valley Air LLC')).toBeVisible();
  });
});

test.describe('client user', () => {
  test.use({ storageState: OWNER_STATE });

  test('client user sees tiers on tracked list and no suggestions panel', { tag: ['@rivals', '@competitors'] }, async ({ page }) => {
    await page.goto(`/c/${fx().clientId}/competitors`);
    const row = page.getByRole('row').filter({ hasText: 'Brazos Valley Air' });
    await expect(row.getByText('Top rival', { exact: true })).toBeVisible();
    await expect(row.getByText(/^Rated /)).toBeVisible();
    await expect(row.getByRole('img', { name: /^Google ads · 4\./ })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Paluxy Heating' }).getByText('Not rated yet')).toBeVisible();

    // No suggestions, hidden list, search or ad-account data for a client user.
    await expect(page.getByRole('button', { name: /find competitors/i })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText('Worth watching')).toHaveCount(0);
    await expect(page.getByText('Show 2 hidden')).toHaveCount(0);
    await expect(page.getByText('Hood County Comfort')).toHaveCount(0);
  });
});

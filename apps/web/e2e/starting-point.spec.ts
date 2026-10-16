import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { ASK_FIXTURE_FILE, STARTING_FIXTURE_FILE } from '../playwright.config';
import type { AskFixture, StartingPointFixture } from './seed';

/**
 * Phase 12b on seeded data (no worker runs in E2E): a fresh client sees the progress card; the agency approves a ready
 * starting point (sent at once, 12b Q2) and the client sees tiles, scorecard and finding cards; a quiet week shows
 * "Where you stand" with text beside every arrow; a client never sees the upsell tag. The Ask client user owns all
 * three clients, so this spec reuses the shared admin and asker sessions (no extra magic-link sign-in).
 */
const OWNER_STATE = fileURLToPath(new URL('../test-results/asker-state.json', import.meta.url));
const fx = (): StartingPointFixture => JSON.parse(readFileSync(STARTING_FIXTURE_FILE, 'utf8')) as StartingPointFixture;

/** The Ask client user; one shared sign-in per run (Better Auth's per-IP limit, see helpers.ts). */
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

test.describe('client user', () => {
  test.use({ storageState: OWNER_STATE });

  test('new client shows progress card', { tag: ['@starting-point', '@overview'] }, async ({ page }) => {
    await page.goto(`/c/${fx().fresh.id}`);
    await expect(page.getByRole('heading', { name: 'Preparing your starting point' })).toBeVisible();
    const card = page.getByRole('heading', { name: 'Preparing your starting point' }).locator('..');
    for (const check of ['Your Google profile', 'Your reviews', 'Map rankings', 'Competitors']) await expect(card.getByText(check, { exact: true })).toBeVisible();
    // Nothing has been collected yet, so no check is done; the old empty-state copy is replaced by the card.
    await expect(card.getByText('In progress').first()).toBeVisible();
    await expect(page.getByText('No briefs yet')).toHaveCount(0);
  });

  test('quiet week shows Where you stand with ▲▼ text', { tag: ['@starting-point', '@briefs'] }, async ({ page }) => {
    const { quiet } = fx();
    await page.goto(`/c/${quiet.id}/briefs/${quiet.quietBriefId}`);
    await expect(page.getByRole('heading', { name: 'Where you stand' })).toBeVisible();
    // Rating and reviews rose, the reply rate fell, the map share is unchanged: every arrow carries its words.
    await expect(page.getByText('Up 0.1 since your starting point')).toBeVisible();
    await expect(page.getByText('Up 4 since your starting point')).toBeVisible();
    await expect(page.getByText('Down 5 pts since your starting point')).toBeVisible();
    await expect(page.getByText('No change since your starting point')).toBeVisible();
    await expect(page.getByText('▲').first()).toBeVisible();
    await expect(page.getByText('▼').first()).toBeVisible();
    // The scorecard: the client's own row first, rivals with their tier, nothing measured shown as a dash.
    const table = page.getByRole('table', { name: /Scorecard/ });
    await expect(table.getByRole('row').nth(1)).toContainText(`${quiet.name} (you)`);
    await expect(table.getByText('Top rival', { exact: true })).toBeVisible();
    await expect(table.getByText('—').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'First moves still open' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Text every customer a Google review link' })).toBeVisible();
  });

  test('client user sees no upsell tag in starting point', { tag: ['@starting-point', '@briefs'] }, async ({ page }) => {
    const { quiet } = fx();
    await page.goto(`/c/${quiet.id}/briefs/${quiet.sentBriefId}`);
    // The seeded ads finding carries `ppc_audit` for the agency only.
    await expect(page.getByText('Try a small Google search ads budget')).toBeVisible();
    await expect(page.getByText('Upsell')).toHaveCount(0);
    await expect(page.getByText('ppc_audit')).toHaveCount(0);
  });
});

test('agency approves starting point → client sees tiles, scorecard, cards', { tag: ['@starting-point', '@briefs', '@clients'] }, async ({ browser }) => {
  const { ready } = fx();
  const agency = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await agency.newPage();
  await page.goto('/agency/approvals');
  await page.getByRole('link', { name: ready.name }).first().click();
  await expect(page.getByText('Where Starting Point Heating stands against the 2 rivals we now watch.').first()).toBeVisible();
  await page.getByRole('button', { name: /approve/i }).click();
  // A starting point goes out on approval (12b Q2), so the review page flips straight to Sent.
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Approved — sent to the client\./)).toBeVisible();
  // The review page names it a starting point and shows its scorecard; it has no auto-send switch.
  await expect(page.getByRole('heading', { name: `${ready.name} · Starting point` })).toBeVisible();
  await expect(page.getByRole('table', { name: /scorecard/i })).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  // The agency's own view still carries the upsell tag.
  await page.goto(`/c/${ready.id}/briefs/${ready.briefId}`);
  await expect(page.getByText('Upsell: ppc_audit')).toBeVisible();
  // The Overview shows the whole latest brief (no "Open brief" hop): tiles, scorecard and finding cards, plus the agency badge.
  await page.goto(`/c/${ready.id}`);
  await expect(page.getByRole('heading', { name: 'Your starting point' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rating' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Scorecard/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ask more customers for a review' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open brief' })).toHaveCount(0);
  await agency.close();

  const clientCtx = await browser.newContext({ storageState: OWNER_STATE });
  const client = await clientCtx.newPage();
  await client.goto(`/c/${ready.id}/briefs/${ready.briefId}`);
  await expect(client.getByText('Your starting point', { exact: true })).toBeVisible();
  await expect(client.getByText(/^Starting point · \d{4}-\d{2}-\d{2}$/)).toBeVisible();
  await expect(client.getByText(`Where ${ready.name} stands against the 2 rivals we now watch. Weekly briefs from here show what changes.`)).toBeVisible();
  for (const label of ['Rating', 'New reviews · 90 d', 'Reply rate', 'Top-3 in map pack']) await expect(client.getByRole('heading', { name: label })).toBeVisible();
  await expect(client.getByText('rivals 4.6 median')).toBeVisible();
  const table = client.getByRole('table', { name: /Scorecard/ });
  await expect(table.getByRole('row').nth(1)).toContainText(`${ready.name} (you)`);
  await expect(table.getByRole('row').filter({ hasText: 'Granbury Cooling Pros' })).toContainText('Top rival');
  for (const headline of ['Ask more customers for a review', 'Try a small Google search ads budget', 'Promote what customers praise']) {
    await expect(client.getByRole('heading', { name: headline })).toBeVisible();
  }
  await expect(client.getByText('Upsell')).toHaveCount(0);
  await clientCtx.close();
});

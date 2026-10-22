import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, test, type TestInfo } from '@playwright/test';
import { ASK_FIXTURE_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import type { AskFixture } from './seed';

/**
 * 15b-1 help system, end to end against the real guides and glossary (`seedKnowledge` in the E2E seed): the page guide
 * shows the audience's own version (client vs agency), a HelpTip opens and closes from the keyboard, the Help page
 * searches the guides and lists only the glossary terms the viewer may see, and the guide's "Ask {assistant} about this
 * page" link opens Ask with the question (the fake AI, `ASK_FAKE_AI=1`, answers it).
 */
const ASKER_STATE = fileURLToPath(new URL('../test-results/asker-state.json', import.meta.url));
const ASKER = 'asker@e2e.test';
const fx = (): AskFixture => JSON.parse(readFileSync(ASK_FIXTURE_FILE, 'utf8')) as AskFixture;

// Opening lines of the two Overview guide versions (docs/help/pages/client.overview.{client,agency}.md).
const CLIENT_COPY = 'Your home page: how Ask Demo Heating stands against its competitors this week, at a glance.';
const AGENCY_COPY = "The client's home page: how Ask Demo Heating stands against its competitors this week.";

/** One magic-link sign-in for the client user per run (Better Auth's per-IP limit, see helpers.ts). */
async function ensureAskerState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(ASKER_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, ASKER, `/c/${fx().askCo.id}`);
  await expect(page).toHaveURL(new RegExp(`/c/${fx().askCo.id}$`));
  await context.storageState({ path: ASKER_STATE });
  await context.close();
}

test.describe('as a client owner', () => {
  test.beforeAll(async ({ browser }, testInfo) => ensureAskerState(browser, testInfo));
  test.use({ storageState: ASKER_STATE });

  test('the Overview guide shows the client version, not the agency one', { tag: ['@help', '@overview'] }, async ({ page }) => {
    await page.goto(`/c/${fx().askCo.id}`);
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(CLIENT_COPY, { exact: true })).toBeVisible();
    await expect(sheet.getByText(AGENCY_COPY, { exact: false })).toHaveCount(0);
    await expect(sheet.getByText(/Upsell/)).toHaveCount(0);
  });

  test('a HelpTip opens with Enter, closes with Escape and returns focus', { tag: ['@help', '@reviews'] }, async ({ page }) => {
    await page.goto(`/c/${fx().askCo.id}/reviews`);
    const tip = page.getByRole('button', { name: 'Reading the heatmap', exact: true });
    await tip.focus();
    await page.keyboard.press('Enter');
    const popover = page.getByRole('dialog');
    await expect(popover.getByText('Reading the heatmap', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(tip).toBeFocused();
  });

  test('the Competitors guide (content wave) shows the client version, without agency-only suggestions', { tag: ['@help', '@competitors'] }, async ({ page }) => {
    await page.goto(`/c/${fx().askCo.id}/competitors`);
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('with how closely each one competes.', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Suggested competitors', { exact: false })).toHaveCount(0);
  });

  test('the Help page searches the guides and lists client glossary terms only', { tag: ['@help'] }, async ({ page }) => {
    await page.goto(`/c/${fx().askCo.id}/help`);
    await page.getByRole('searchbox', { name: 'Search help' }).fill('heatmap');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/help\?q=heatmap/);
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('link', { name: 'Reviews', exact: true })).toBeVisible();
    const glossary = page.getByRole('region', { name: 'Glossary' });
    await expect(glossary.getByText('Competitive pressure', { exact: true })).toBeVisible();
    await expect(glossary.getByText('Upsell tag', { exact: true })).toHaveCount(0);
  });

  test('"Ask Friday about this page" opens Ask with the question, which is sent', { tag: ['@help', '@ask'] }, async ({ page }) => {
    const { askCo } = fx();
    await page.goto(`/c/${askCo.id}`);
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    const link = page.getByRole('link', { name: 'Ask Friday about this page', exact: true });
    await expect(link).toHaveAttribute('href', `/c/${askCo.id}/ask?q=Explain%20the%20Overview%20page`);
    // Ask replaces the URL once the question is sent, so wait for the `?q=` URL from before the click.
    const asked = page.waitForURL((u) => u.pathname === `/c/${askCo.id}/ask` && u.searchParams.get('q') === 'Explain the Overview page');
    await link.click();
    await asked;
    await expect(page.getByText('Explain the Overview page', { exact: true }).first()).toBeVisible();
  });
});

test.describe('as an agency admin', () => {
  test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));
  test.use({ storageState: ADMIN_STATE });

  test('the Overview guide shows the agency version, and the agency glossary has agency terms', { tag: ['@help', '@overview'] }, async ({ page }) => {
    await page.goto(`/c/${fx().askCo.id}`);
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(AGENCY_COPY, { exact: false })).toBeVisible();
    await expect(sheet.getByText(CLIENT_COPY, { exact: true })).toHaveCount(0);

    await page.goto('/agency/help');
    await expect(page.getByRole('region', { name: 'Glossary' }).getByText('Upsell tag', { exact: true })).toBeVisible();
  });

  test('the Team guide (agency content wave) opens with the agency version', { tag: ['@help', '@navigation'] }, async ({ page }) => {
    await page.goto('/agency/settings/team');
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('The people who can work in your agency', { exact: false })).toBeVisible({ timeout: 15_000 });
  });

  test('the Inbox (account) and platform Health guides show their own versions', { tag: ['@help', '@platform'] }, async ({ page }) => {
    // Account page: the agency version mentions the clients you receive notices for.
    await page.goto('/inbox');
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('They cover the clients you receive notices for', { exact: false })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    // Platform page (admin@e2e.test is also an operator): the operator guide.
    await page.goto('/platform/health');
    await page.getByRole('button', { name: 'Guide', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('the background worker, its job queues, the data vendors', { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});

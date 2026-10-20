import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';
import { createDb } from '@cs/db';
import { sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { CB_CLIENT, CB_USERS, NAV_ARCHIVE_BRIEFS, NAV_ARCHIVE_NAME } from './seed';

/**
 * Phase 15a shell (spec §2): the context switcher (Platform → Agency → Client and back), the grouped menus, the old
 * agency URLs' permanent redirects, Briefs & reports (tabs, paging, Previous / Next), the mobile drawer and the
 * support session's "Back to platform". Signed-in sessions are reused (magic-link rate limit): the shared admin
 * (an env-listed platform owner who administers "E2E Agency") and `client-billing.spec`'s client owner state.
 */
const OWNER_STATE = fileURLToPath(new URL('../test-results/client-billing-owner-state.json', import.meta.url));

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

async function idOf(table: 'client' | 'agency', name: string): Promise<string> {
  return withDb(async (db) => {
    const rows = [...(await db.execute<{ id: string }>(table === 'client' ? sql`select id from client where name = ${name}` : sql`select id from agency where name = ${name}`))];
    return rows[0]!.id;
  });
}

/** The same storage state `client-billing.spec` writes (one magic-link sign-in per run, whichever spec runs first). */
async function ensureOwnerState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(OWNER_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await signIn(await context.newPage(), CB_USERS.owner, '/');
    await context.storageState({ path: OWNER_STATE });
  } finally {
    await context.close();
  }
}

/** The sidebar (from `lg` up) and its context switcher trigger. */
const sidebar = (page: Page) => page.locator('aside');
const trigger = (scope: Locator) => scope.locator('button[aria-haspopup="dialog"]');
/** Every sidebar menu label, in order (whitespace collapsed, count badges left out; the Ask pill reads "Ask Friday"). */
const menuLinks = (page: Page) =>
  sidebar(page).locator('nav a').evaluateAll((els) =>
    els.map((e) => {
      const copy = e.cloneNode(true) as HTMLElement;
      for (const badge of copy.querySelectorAll('[aria-label$=" new"]')) badge.remove();
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    }),
  );

test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));

test.describe('as the operator', () => {
  test.use({ storageState: ADMIN_STATE });

  test('the switcher goes Platform → Agency → a searched client and back to Agency view', { tag: ['@navigation', '@platform', '@clients'] }, async ({ page }) => {
    await page.goto('/platform');
    await expect(trigger(sidebar(page))).toContainText('Operator console');
    await trigger(sidebar(page)).click();
    await page.getByRole('option', { name: 'Switch to Agency view' }).click();
    await expect(page).toHaveURL(/\/agency$/);
    await expect(trigger(sidebar(page))).toContainText('Agency view');
    expect(await menuLinks(page)).toEqual(expect.arrayContaining(['Portfolio', 'Approvals', 'Agency settings']));

    await trigger(sidebar(page)).click();
    await page.getByPlaceholder('Search clients').fill('archive');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.getByRole('option', { name: new RegExp(NAV_ARCHIVE_NAME) }).click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
    await expect(trigger(sidebar(page))).toContainText(NAV_ARCHIVE_NAME);
    // Spec §2.3: Ask {assistant} first, Client settings at the foot.
    const links = await menuLinks(page);
    expect(links[0]).toBe('Ask Friday');
    expect(links[1]).toBe('Overview');
    expect(links.at(-1)).toBe('Client settings');
    expect(links).toContain('Briefs & reports');

    await trigger(sidebar(page)).click();
    // The client just opened is the first Recent one.
    await expect(page.getByRole('group', { name: 'Recent' }).getByRole('option').first()).toContainText(NAV_ARCHIVE_NAME);
    await page.getByRole('option', { name: 'Switch to Agency view' }).click();
    await expect(page).toHaveURL(/\/agency$/);
    await expect(trigger(sidebar(page))).toContainText('Agency view');
    await trigger(sidebar(page)).click();
    await page.getByRole('option', { name: 'Switch to Platform view' }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(trigger(sidebar(page))).toContainText('Operator console');
  });

  test('old agency URLs land on the settings pages, query kept', { tag: ['@navigation'] }, async ({ page }) => {
    const res = await page.request.get('/agency/team?x=1', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toBe('/agency/settings/team?x=1');

    await page.goto('/agency/branding');
    await expect(page).toHaveURL(/\/agency\/settings\/branding$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Branding & voice', exact: true })).toBeVisible();
    await page.goto('/agency/team?x=1');
    await expect(page).toHaveURL(/\/agency\/settings\/team\?x=1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Team', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Agency settings', exact: true })).toBeVisible();
  });

  test('the sidebar settings links open the first tab, selected', { tag: ['@navigation'] }, async ({ page }) => {
    const settingsNav = page.getByRole('navigation', { name: 'Settings' });
    await page.goto('/agency');
    await sidebar(page).getByRole('link', { name: 'Agency settings', exact: true }).click();
    await expect(page).toHaveURL(/\/agency\/settings\/branding$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Branding & voice', exact: true })).toBeVisible();
    await expect(settingsNav.locator('a[aria-current="page"]')).toHaveText('Branding & voice');

    const clientId = await idOf('client', NAV_ARCHIVE_NAME);
    await page.goto(`/c/${clientId}`);
    await sidebar(page).getByRole('link', { name: 'Client settings', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${clientId}/settings/profile$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Business profile', exact: true })).toBeVisible();
    await expect(settingsNav.locator('a[aria-current="page"]')).toHaveText('Business profile');
  });

  test('Briefs & reports: tabs, the next page and Previous / Next on a brief', { tag: ['@navigation', '@briefs'] }, async ({ page }) => {
    const clientId = await idOf('client', NAV_ARCHIVE_NAME);
    await page.goto(`/c/${clientId}`);
    await sidebar(page).getByRole('link', { name: 'Briefs & reports', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${clientId}/briefs$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Briefs & reports', exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Briefs and reports views' });
    await expect(tabs.getByRole('link', { name: 'Weekly briefs', exact: true })).toHaveAttribute('aria-current', 'page');

    // Newest first, 20 a page: weeks 22..3 here, weeks 2 and 1 on the next page.
    const rows = page.getByRole('main').getByRole('link', { name: /Archive week \d+:/ });
    await expect(rows).toHaveCount(20);
    await expect(rows.first()).toContainText(`Archive week ${NAV_ARCHIVE_BRIEFS}:`);
    await expect(rows.last()).toContainText('Archive week 3:');
    await expect(rows.first()).toContainText('Sent');
    const pages = page.getByRole('navigation', { name: 'Pages' });
    await pages.getByRole('link', { name: 'Older', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=briefs&page=2$/);
    await expect(rows).toHaveCount(NAV_ARCHIVE_BRIEFS - 20);
    await expect(rows.first()).toContainText('Archive week 2:');
    await expect(pages.getByRole('link', { name: 'Older', exact: true })).toHaveCount(0);
    await expect(pages.getByRole('link', { name: 'Newer', exact: true })).toBeVisible();

    await tabs.getByRole('link', { name: 'Alerts', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=alerts$/);
    await expect(page.getByText('No alerts yet. Alerts are sent when a competitor makes an urgent change.')).toBeVisible();
    await tabs.getByRole('link', { name: 'Quarterly reports', exact: true }).click();
    await expect(page).toHaveURL(/\?tab=reports$/);
    await expect(page.getByText('No quarterly reports yet.')).toBeVisible();

    await tabs.getByRole('link', { name: 'Weekly briefs', exact: true }).click();
    await page.getByRole('main').getByRole('link', { name: /Archive week 21:/ }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${clientId}/briefs/[0-9a-f-]{36}$`));
    await expect(page.getByRole('heading', { level: 1, name: /^Week of / })).toBeVisible();
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: NAV_ARCHIVE_NAME, exact: true })).toBeVisible();
    await expect(crumbs.getByRole('link', { name: 'Briefs & reports', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in approvals', exact: true })).toBeVisible();
    await expect(page.getByText('Archive week 21:')).toBeVisible();

    const prevNext = page.getByRole('navigation', { name: 'Previous and next' });
    await prevNext.getByRole('link', { name: '‹ Previous' }).click();
    await expect(page.getByText('Archive week 20:')).toBeVisible();
    await prevNext.getByRole('link', { name: 'Next ›' }).click();
    await expect(page.getByText('Archive week 21:')).toBeVisible();
    await prevNext.getByRole('link', { name: 'Next ›' }).click();
    await expect(page.getByText(`Archive week ${NAV_ARCHIVE_BRIEFS}:`)).toBeVisible();
    // The newest brief has no Next.
    await expect(prevNext.getByRole('link', { name: 'Next ›' })).toHaveCount(0);
    await expect(prevNext.getByRole('link', { name: '‹ Previous' })).toBeVisible();
  });

  test('at 390px the drawer holds the switcher, its client list scrolls, and it closes after navigating', { tag: ['@navigation', '@responsive'] }, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/agency');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await trigger(drawer).click();

    // The modal popover inside the modal drawer: the long All clients list overflows and scrolls by wheel.
    const list = page.locator('[cmdk-list]');
    await expect(page.getByRole('group', { name: 'All clients' })).toBeVisible();
    await expect.poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
    await list.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.getByPlaceholder('Search clients').fill('E2E HVAC');
    await page.getByRole('option', { name: /E2E HVAC/ }).first().click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
    await expect(drawer).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Changes', exact: true }).click();
    await expect(page).toHaveURL(/\/changes$/);
    await expect(drawer).toBeHidden();
  });
});

test('a support session switcher offers "Back to platform" and the session continues', { tag: ['@navigation', '@support'] }, async ({ browser }, testInfo) => {
  const agencyId = await idOf('agency', 'Support Target Agency');
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
  try {
    const page = await context.newPage();
    const banner = page.getByRole('region', { name: 'Support session' });
    await page.goto(`/platform/agencies/${agencyId}`);
    await page.getByRole('button', { name: 'View as agency' }).click();
    await page.getByLabel('Why are you opening this agency? (shown to the agency)').fill('Checking the switcher in a support session');
    await page.getByRole('button', { name: 'Start read-only session' }).click();
    await expect(page).toHaveURL(/\/agency$/);
    await expect(banner).toBeVisible();
    await expect(trigger(sidebar(page))).toContainText('Support Target Agency');

    await trigger(sidebar(page)).click();
    await expect(page.getByRole('option', { name: /Target Plumbing/ })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Switch to Platform view' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Back to platform' }).click();
    await expect(page).toHaveURL(new RegExp(`/platform/agencies/${agencyId}$`));

    // The session continues (8b): the agency pages still open read-only, then Exit ends it.
    await page.goto('/agency');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL(new RegExp(`/platform/agencies/${agencyId}\\?ended=1$`));
  } finally {
    await context.close();
  }
});

test('a client owner of one client gets no switcher and no Platform', { tag: ['@navigation', '@client-billing'] }, async ({ browser }, testInfo) => {
  await ensureOwnerState(browser, testInfo);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: OWNER_STATE });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
    await expect(sidebar(page)).toContainText(CB_CLIENT);
    await expect(trigger(sidebar(page))).toHaveCount(0);
    await expect(sidebar(page).getByText('Platform', { exact: true })).toHaveCount(0);
    const links = await menuLinks(page);
    expect(links).not.toContain('Agencies');
    expect(links).not.toContain('Portfolio');
    expect((await page.goto('/platform'))?.status()).toBe(404);
  } finally {
    await context.close();
  }
});

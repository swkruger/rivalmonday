import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from '@cs/db';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { ASK_FIXTURE_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import type { AskFixture } from './seed';

/**
 * Phase 6b "Ask {assistantName}" with the deterministic fake AI (`ASK_FAKE_AI=1`): a cited answer from a starter chip,
 * the quota copy with no usage numbers (e4), a confirmed write (e8), author-only threads (e5), platform review of
 * review-allowed clients only, and the disclosure line following the review toggle.
 */
const ASKER_STATE = fileURLToPath(new URL('../test-results/asker-state.json', import.meta.url));
const ASKER = 'asker@e2e.test';
const QUOTA_COPY = "You have reached this month's quota.";
const DISCLOSURE = 'Conversations may be reviewed by Rival Monday to improve answers.';

const fx = (): AskFixture => JSON.parse(readFileSync(ASK_FIXTURE_FILE, 'utf8')) as AskFixture;

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

async function ask(page: Page, question: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Ask Friday a question', exact: true }).fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
}

/**
 * e4: nothing that reads like a usage count or limit. Dates (e.g. 10/12, "2026-10-12") and the KPI aria-labels are not
 * page text of this shape, so the patterns stay specific to usage wording.
 */
async function expectNoUsageNumbers(page: Page): Promise<void> {
  const text = (await page.locator('main').innerText()).replaceAll(QUOTA_COPY, '');
  expect(text).not.toMatch(/quota/i);
  expect(text).not.toMatch(/\b\d+\s*(?:of|\/)\s*\d+\s*(?:questions?|messages?|asks?|answers?)\b/i);
  expect(text).not.toMatch(/\b\d+\s+(?:questions?|messages?|asks?)\s+(?:left|remaining|used)\b/i);
  expect(text).not.toMatch(/\b(?:left|remaining|used)\s*:?\s*\d+/i);
  // The client profile's "contact your account manager" (to change services) is not about usage.
  expect(text).not.toMatch(/(?:limit|quota|questions?|more)[^.]*account manager/i);
}

test.describe('as a client user', () => {
  test.beforeAll(async ({ browser }, testInfo) => ensureAskerState(browser, testInfo));
  test.use({ storageState: ASKER_STATE });

  test('starter chip → cited answer with chip opening evidence viewer → save as recommendation appears on Recommendations', { tag: ['@ask', '@overview', '@evidence', '@recommendations'] }, async ({ page }) => {
    const { askCo, starters } = fx();
    await page.goto(`/c/${askCo.id}`);
    const card = page.getByRole('region', { name: 'Ask Friday', exact: true });
    await card.getByRole('link', { name: starters[0], exact: true }).click();
    // `?q=` is sent once; the page then follows the new thread.
    await expect(page).toHaveURL(new RegExp(`/c/${askCo.id}/ask/[0-9a-f-]{36}$`));
    await expect(page.getByText(starters[0]!, { exact: true }).last()).toBeVisible();
    const chip = page.getByRole('link', { name: 'Evidence 1', exact: true });
    await expect(chip).toBeVisible();
    await expect(page.getByText(DISCLOSURE, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Save as recommendation', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title', { exact: true }).fill('Match the $79 tune-up offer');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved to Recommendations' })).toBeVisible();

    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/c/${askCo.id}/evidence/[0-9a-f-]{36}$`));
    await expect(page.getByRole('heading', { name: 'Evidence — Smith HVAC', exact: true })).toBeVisible();

    await page.goto(`/c/${askCo.id}/recommendations`);
    await expect(page.getByRole('region', { name: 'To do', exact: true }).getByText('Match the $79 tune-up offer', { exact: true })).toBeVisible();
  });

  test('client at quota sees exact copy; no number appears on Ask, Overview, Settings', { tag: ['@ask', '@overview', '@profile'] }, async ({ page }) => {
    const { quotaCo } = fx();
    await page.goto(`/c/${quotaCo.id}/ask`);
    await ask(page, 'Are any rivals running new promotions?');
    await expect(page.getByText(QUOTA_COPY, { exact: true }).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/c/${quotaCo.id}/ask/[0-9a-f-]{36}$`));
    await expect(page.getByText(QUOTA_COPY, { exact: true }).first()).toBeVisible();
    await expectNoUsageNumbers(page);

    await page.goto(`/c/${quotaCo.id}`);
    await expect(page.getByRole('region', { name: 'Ask Friday', exact: true })).toBeVisible();
    await expectNoUsageNumbers(page);

    await page.goto(`/c/${quotaCo.id}/settings/profile`);
    await expect(page.getByRole('heading', { name: /^Services & area/ })).toBeVisible();
    await expectNoUsageNumbers(page);
  });

  test('confirm card: proposed write confirmed once', { tag: ['@ask', '@changes'] }, async ({ page }) => {
    const { askCo } = fx();
    await page.goto(`/c/${askCo.id}/ask`);
    await ask(page, 'Rate the latest change as useful');
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(page.getByText('Rate this change as useful', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/c/${askCo.id}/ask/[0-9a-f-]{36}$`));
    await confirm.click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await expect(confirm).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await expect(confirm).toHaveCount(0);

    // The tool ran exactly once: one `useful` rating by this user.
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      const rows = [...(await db.execute<{ n: number }>(sql`
        select count(*)::int as n from feedback f join auth."user" u on u.id = f.actor
        where u.email = ${ASKER} and f.client_id = ${askCo.id} and f.subject_type = 'event' and f.after->>'verdict' = 'useful'`))];
      expect(rows[0]?.n).toBe(1);
    } finally {
      await close();
    }
  });

  test('the Ask page has no horizontal page scroll at 390 px with a long URL', { tag: ['@ask', '@responsive'] }, async ({ page }) => {
    const { askCo } = fx();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/c/${askCo.id}/ask`);
    const url = `https://smithhvac.example/pricing/${'a1b2c3d4'.repeat(30)}`;
    await ask(page, `What changed on ${url}`);
    await expect(page.getByRole('link', { name: 'Evidence 1', exact: true })).toBeVisible();
    await expect(page.getByText(url, { exact: false }).first()).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(fits).toBe(true);
  });
});

test.describe('as the agency admin (also the platform operator)', () => {
  test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));
  test.use({ storageState: ADMIN_STATE });

  test("agency admin opening a client user's thread URL gets 404", { tag: ['@ask'] }, async ({ page }) => {
    const { askCo, askThreadId } = fx();
    const res = await page.goto(`/c/${askCo.id}/ask/${askThreadId}`);
    expect(res?.status()).toBe(404);
    await page.goto(`/c/${askCo.id}/ask`);
    await expect(page.getByText('Seeded question about Smith pricing')).toHaveCount(0);
  });

  test('platform admin sees review-allowed thread with trace; disallowed client absent', { tag: ['@ask', '@platform'] }, async ({ page }) => {
    const { askCo, privateCo, askThreadId, privateThreadId } = fx();
    await page.goto('/platform/ask');
    await expect(page.getByRole('heading', { name: 'Ask review', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: askCo.name, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: privateCo.name, exact: true })).toHaveCount(0);

    await page.goto(`/platform/ask/${askThreadId}`);
    await expect(page.getByRole('heading', { name: 'Seeded question about Smith pricing', exact: true })).toBeVisible();
    await page.getByText('Trace', { exact: true }).click();
    await expect(page.getByText(/"tool": "search_events"/)).toBeVisible();

    const res = await page.goto(`/platform/ask/${privateThreadId}`);
    expect(res?.status()).toBe(404);
  });

  test('review toggle off hides the disclosure line', { tag: ['@ask', '@profile'] }, async ({ page }) => {
    const { toggleCo } = fx();
    await page.goto(`/c/${toggleCo.id}/ask`);
    await expect(page.getByText(DISCLOSURE, { exact: true })).toBeVisible();

    await page.goto(`/c/${toggleCo.id}/settings/profile`);
    await page.getByLabel(/Allow review to improve answers/).uncheck();
    await page.getByRole('button', { name: 'Save features', exact: true }).click();
    await expect(page.getByText('Features saved.', { exact: true })).toBeVisible();

    await page.goto(`/c/${toggleCo.id}/ask`);
    await expect(page.getByRole('heading', { name: /^Ask/ })).toBeVisible();
    await expect(page.getByText(DISCLOSURE, { exact: true })).toHaveCount(0);
  });
});

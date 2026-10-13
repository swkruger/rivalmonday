import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { ASK_FIXTURE_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import type { AskFixture } from './seed';

/**
 * Phase 6c knowledge base, end to end with the fake AI (`ASK_FAKE_AI=1`): an operator publishes a client-level fact,
 * the client user asks Friday and opens the cited article, the operator unpublishes it, and a non-operator gets 404.
 * The fake AI searches knowledge for the token after "knowledge base:" (full-text only, no embeddings in E2E).
 * Titles and the token are unique per run, so a retry never collides with leftovers.
 */
const ASKER_STATE = fileURLToPath(new URL('../test-results/asker-state.json', import.meta.url));
const ASKER = 'asker@e2e.test';
const MISSING = 'This article is no longer available.';
const fx = (): AskFixture => JSON.parse(readFileSync(ASK_FIXTURE_FILE, 'utf8')) as AskFixture;

/** Letters only, so the full-text token is one lexeme whatever the stemmer does. */
const run = Date.now().toString(26).replace(/[0-9]/g, (d) => 'qrstuvwxyz'[Number(d)]!);
const TOKEN = `quokka${run}`;
const TITLE = `Quokka harbour policy ${run}`;

async function ensureAskerState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(ASKER_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, ASKER, `/c/${fx().askCo.id}`);
  await expect(page).toHaveURL(new RegExp(`/c/${fx().askCo.id}$`));
  await context.storageState({ path: ASKER_STATE });
  await context.close();
}

async function asClient<T>(browser: Browser, testInfo: TestInfo, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ASKER_STATE });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Ask the fake AI to look the token up; resolves with the thread URL once the cited answer is visible. */
async function askAboutToken(page: Page): Promise<void> {
  await page.goto(`/c/${fx().askCo.id}/ask`);
  await page.getByRole('textbox', { name: 'Ask Friday a question', exact: true }).fill(`What is our policy? knowledge base: ${TOKEN}`);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Article', exact: true })).toBeVisible();
}

test.describe.serial('knowledge base', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await ensureAskerState(browser, testInfo);
  });

  test('operator creates and publishes a client-level fact; it is listed as Published', { tag: ['@kb', '@platform'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
    const page = await context.newPage();
    await page.goto('/platform/knowledge/new');
    await page.getByLabel('Title', { exact: true }).fill(TITLE);
    await page.locator('select[name=level]').selectOption('client');
    await page.locator('select[name=agencyId]').selectOption({ index: 1 });
    await page.locator('select[name=clientId]').selectOption({ label: fx().askCo.name });
    await page.locator('select[name=kind]').selectOption('fact');
    await page.getByLabel('Body (Markdown)', { exact: true }).fill(`The ${TOKEN} policy: every visitor to the harbour office signs the guest book.`);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page).toHaveURL(/\/platform\/knowledge\/[0-9a-f-]{36}/);

    await page.goto('/platform/knowledge');
    const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: TITLE, exact: true }) });
    await expect(row.getByText('Published', { exact: true })).toBeVisible();
    await expect(row).toContainText(fx().askCo.name);
    await context.close();
  });

  test('client asks, sees the Article chip, and the sheet shows the title and "Your business"', { tag: ['@kb', '@ask'] }, async ({ browser }, testInfo) => {
    await asClient(browser, testInfo, async (page) => {
      await askAboutToken(page);
      await page.getByRole('button', { name: 'Article', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByText(TITLE, { exact: true }).first()).toBeVisible();
      await expect(sheet.getByText('Your business', { exact: true })).toBeVisible();
    });
  });

  test('after the operator unpublishes it, the cited chip shows the missing copy', { tag: ['@kb', '@platform'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
    const admin = await context.newPage();
    await admin.goto('/platform/knowledge');
    await admin.getByRole('link', { name: TITLE, exact: true }).click();
    await admin.getByRole('button', { name: 'Unpublish', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Unpublish', exact: true })).toHaveCount(0);
    await context.close();

    await asClient(browser, testInfo, async (page) => {
      // Reopen the saved thread (the answer, with its chip, is stored); the article is no longer readable.
      await page.goto(`/c/${fx().askCo.id}/ask`);
      await page.getByRole('link', { name: /knowledge base/i }).first().click();
      await page.getByRole('button', { name: 'Article', exact: true }).first().click();
      await expect(page.getByRole('dialog').getByText(MISSING, { exact: true })).toBeVisible();
    });
  });

  test('a non-operator at /platform/knowledge gets 404', { tag: ['@kb', '@platform'] }, async ({ browser }, testInfo) => {
    await asClient(browser, testInfo, async (page) => {
      const res = await page.goto('/platform/knowledge');
      expect(res?.status()).toBe(404);
    });
  });
});

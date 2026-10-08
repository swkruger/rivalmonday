import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/**
 * One magic-link sign-in for the whole file, reused as storage state by every test. Better Auth's magic-link plugin
 * allows 5 requests per IP per rolling 60 s on `/sign-in/magic-link` and `/magic-link/verify` (correct production
 * behaviour), and every Playwright request comes from one IP; signing in per test put the suite at exactly 5.
 */
const ADMIN_STATE = fileURLToPath(new URL('../test-results/admin-state.json', import.meta.url));

test.beforeAll(async ({ browser }, testInfo) => {
  // `test.use({ storageState })` below also applies to contexts made here, so start this one explicitly empty.
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, 'admin@e2e.test');
  await expect(page).toHaveURL(/\/agency$/);
  await context.storageState({ path: ADMIN_STATE });
  await context.close();
});

test.use({ storageState: ADMIN_STATE });

test('an admin adds a client and lands on its competitors page', async ({ page }) => {
  await page.goto('/agency/clients/new');
  await page.getByLabel('Business name').fill('E2E Dental');
  await page.getByLabel('Vertical').selectOption('dental');
  await page.getByLabel(/search keywords/i).fill('dentist\nteeth cleaning');
  await page.getByLabel(/map centre/i).fill('33.95, -84.33');
  await page.getByLabel(/radius/i).fill('10');
  await page.getByRole('button', { name: 'Create client' }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/competitors$/);
  await expect(page.getByRole('heading', { name: 'Competitors — E2E Dental' })).toBeVisible();
  // Website monitoring is off in E2E: the Find competitors button exists, but nothing is crawled.
  await expect(page.getByRole('button', { name: /find competitors/i })).toBeEnabled();
});

test('an admin approves the ready brief and its recommendation appears on the board', async ({ page }) => {
  await page.goto('/agency/approvals');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Smith HVAC launched a $49 drain-cleaning promo').first()).toBeVisible();
  await page.getByRole('button', { name: /approve/i }).click();
  await expect(page.getByText(/approved — it goes out monday/i)).toBeVisible();
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).click();
  await page.getByRole('link', { name: 'Recommendations' }).click();
  await expect(page.getByRole('region', { name: 'To do' }).getByText('Run a $49 drain-cleaning bundle')).toBeVisible();
});

test('an admin dismisses a pending alert with a reason', async ({ page }) => {
  await page.goto('/agency/alerts');
  await expect(page.getByText('Smith HVAC started a $49 promo')).toBeVisible();
  await page.getByRole('button', { name: /dismiss/i }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('Client already knows');
  await page.getByRole('dialog').getByRole('button', { name: /dismiss/i }).click();
  await expect(page.getByText('No alerts waiting — nice.')).toBeVisible();
});

test('usage shows the near-cap warning and an admin raises the cap', async ({ page }) => {
  await page.goto('/agency/usage');
  await expect(page.getByText(/87% · near cap/)).toBeVisible();
  await page.getByLabel('Monthly cap for E2E HVAC (USD)').fill('30');
  await page.getByRole('button', { name: 'Save limits for E2E HVAC' }).click();
  await expect(page.getByText('Limits saved.')).toBeVisible();
  await expect(page.getByText(/43%/)).toBeVisible();
});

test('an admin edits a playbook and an unknown placeholder is refused', async ({ page }) => {
  await page.goto('/agency/playbooks');
  const card = page.locator('form').filter({ has: page.locator('input[name="playbookId"][value="price_cut_bundle"]') });
  await card.getByLabel('Template').fill('Hi {{client}}');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('alert')).toContainText('{{client}}');
  await card.getByLabel('Template').fill('Bundle {{service}} instead of matching {{competitor}}.');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Playbook saved.')).toBeVisible();
});

test('a platform operator approves a theme proposal', async ({ page }) => {
  await page.goto('/platform/themes');
  await page.getByRole('button', { name: 'Approve E2E hidden fees' }).click();
  await expect(page.getByText('Approved “E2E hidden fees”.')).toBeVisible();
});

test('a prospect’s landscape report shows and the prospect converts to a client', async ({ page }) => {
  await page.goto('/agency/prospects');
  await page.getByRole('link', { name: 'E2E Prospect Dental' }).click();
  await expect(page.getByRole('table', { name: 'Map visibility' }).getByText('5/9 · top 3: 2 · avg 3.4')).toBeVisible();
  await page.getByRole('button', { name: 'Convert to client' }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await page.goto('/agency');
  await expect(page.getByRole('link', { name: 'E2E Prospect Dental' })).toBeVisible();
});

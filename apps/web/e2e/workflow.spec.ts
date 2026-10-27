import { expect, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * One magic-link sign-in for the whole run, reused as storage state by every test (`ensureAdminState`). Better Auth's
 * magic-link plugin allows 5 requests per IP per rolling 60 s on `/sign-in/magic-link` and `/magic-link/verify`
 * (correct production behaviour), and every Playwright request comes from one IP; on the local test cluster the whole
 * suite runs in under a minute, so each extra sign-in counts (6b added the Ask client user's).
 */
test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));

test.use({ storageState: ADMIN_STATE });

test('an admin adds a client by hand, lands on its setup wizard, then uses its competitors page', { tag: ['@clients', '@competitors'] }, async ({ page }) => {
  await page.goto('/agency/clients/new');
  // Phase 11a: the page opens on the business lookup; the by-hand form is the fallback below it.
  await page.getByRole('button', { name: /enter details by hand/i }).click();
  await page.getByLabel('Business name').fill('E2E Dental');
  await page.getByLabel('Business type', { exact: true }).selectOption('dental');
  await page.getByLabel(/search keywords/i).fill('dentist\nteeth cleaning');
  await page.getByLabel(/map centre/i).fill('33.95, -84.33');
  await page.getByLabel(/radius/i).selectOption({ label: '10 mi' });
  await page.getByRole('button', { name: 'Create client' }).click();
  // Phase 11a: every new client goes through the setup wizard, by-hand creates included.
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
  await page.goto(page.url().replace(/\/setup$/, '/competitors'));
  await expect(page.getByRole('heading', { name: 'Competitors', exact: true, level: 1 })).toBeVisible();
  // Phase 16 P5: searching needs keywords and a service-area centre only; this by-hand client has both, so the first
  // automatic search (12a D4) has already started and the missing-inputs copy never shows.
  await expect(page.getByText('Add keywords and a service area to search.')).toBeHidden();
  await expect(page.getByRole('button', { name: /find competitors|searching/i })).toBeVisible();
  // Link the Google listing through the real profile form; website monitoring is off in E2E, so nothing is crawled.
  await page.getByRole('link', { name: 'Go to Business profile' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.getByLabel('Google Place ID').fill('ChIJe2eDentalPlace');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await page.goBack();
  await page.reload();
  // Complete inputs: the missing-inputs copy is gone. Saving them also starts the automatic first search (12a D4),
  // so the button is either "Find competitors" or, while that search is queued, "Searching…".
  await expect(page.getByText('Add keywords and a service area to search.')).toBeHidden();
  await expect(page.getByRole('button', { name: /find competitors|searching/i })).toBeVisible();
});

test('an admin approves the ready brief and its recommendation appears on the board', { tag: ['@briefs', '@recommendations', '@clients'] }, async ({ page }) => {
  await page.goto('/agency/approvals');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Smith HVAC launched a $49 drain-cleaning promo').first()).toBeVisible();
  await page.getByRole('button', { name: /approve/i }).click();
  await expect(page.getByText(/approved — it goes out monday/i)).toBeVisible();
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).click();
  await page.getByRole('link', { name: 'Recommendations', exact: true }).click();
  await expect(page.getByRole('region', { name: 'To do' }).getByText('Run a $49 drain-cleaning bundle')).toBeVisible();
});

test('an admin dismisses a pending alert with a reason', { tag: ['@alerts'] }, async ({ page }) => {
  await page.goto('/agency/alerts');
  await expect(page.getByText('Smith HVAC started a $49 promo')).toBeVisible();
  await page.getByRole('button', { name: /dismiss/i }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('Client already knows');
  await page.getByRole('dialog').getByRole('button', { name: /dismiss/i }).click();
  await expect(page.getByText('No alerts waiting — nice.')).toBeVisible();
});

test('usage shows credits and the near-limit badge (read-only)', { tag: ['@usage'] }, async ({ page }) => {
  await page.goto('/agency/settings/usage');
  // Seed: $13 spent against the $15 default limit = 1300 of 1500 credits (only platform staff change limits).
  await expect(page.getByText('1,300 of 1,500 credits')).toBeVisible();
  await expect(page.getByText('Near limit', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('$');
});

test('an admin edits a runbook play and an unknown placeholder is refused', { tag: ['@runbook'] }, async ({ page }) => {
  await page.goto('/agency/settings/runbook');
  const card = page.locator('[data-item="play:price_cut_bundle"]');
  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Template').fill('Hi {{client}}');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('alert')).toContainText('{{client}}');
  await card.getByLabel('Template').fill('Bundle {{service}} instead of matching {{competitor}}.');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Customised')).toBeVisible();
});

test('an admin turns a client feature on and off on the profile page', { tag: ['@profile', '@clients'] }, async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/c/${clientId}/settings/profile`);
  const ai = page.getByLabel(/AI connection/);
  await expect(page.getByLabel(/Client dashboard/)).toBeChecked();
  await expect(ai).not.toBeChecked();
  await ai.check();
  await page.getByRole('button', { name: 'Save features' }).click();
  await expect(page.getByText('Features saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/AI connection/)).toBeChecked();
  // Back to the seed's features, so later tests see the client unchanged.
  await page.getByLabel(/AI connection/).uncheck();
  await page.getByRole('button', { name: 'Save features' }).click();
  await expect(page.getByText('Features saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/AI connection/)).not.toBeChecked();
  await expect(page.getByLabel(/Alert rules/)).toBeChecked();
});

test('a platform operator approves a topic proposal', { tag: ['@platform', '@reviews'] }, async ({ page }) => {
  await page.goto('/platform/topics');
  await page.getByRole('button', { name: 'Approve E2E hidden fees' }).click();
  // 15c-2a: approving a topic is confirmed in a dialog.
  await page.getByRole('dialog', { name: 'Approve E2E hidden fees?' }).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Approved “E2E hidden fees”.')).toBeVisible();
  const old = await page.goto('/platform/themes');
  expect(old?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('a prospect’s landscape report shows and the prospect converts to a client', { tag: ['@prospects', '@clients'] }, async ({ page }) => {
  await page.goto('/agency/prospects');
  await page.getByRole('link', { name: 'E2E Prospect Dental' }).click();
  await expect(page.getByRole('table', { name: 'Map visibility' }).getByText('5/9 · top 3: 2 · avg 3.4')).toBeVisible();
  await page.getByRole('button', { name: 'Convert to client' }).click();
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
  await page.goto('/agency');
  await expect(page.getByRole('link', { name: 'E2E Prospect Dental' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));

test.use({ storageState: ADMIN_STATE });

test('the changes feed opens the evidence viewer with both snapshots and the text diff', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Changes' }).click();
  await page.getByRole('link', { name: /Smith HVAC cut its AC tune-up to \$79/ }).click();
  const shots = page.getByRole('img', { name: /snapshot of https:\/\/smithhvac\.example\/pricing/ });
  await expect(shots).toHaveCount(2);
  await expect.poll(() => shots.first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Text changes' }).click();
  await expect(page.locator('ins', { hasText: '$79' })).toBeVisible();
  await page.getByRole('tab', { name: 'Capture details' }).click();
  await expect(page.getByText(/SHA-256/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Useful' }).click();
  await expect(page.getByText('Thanks — saved.')).toBeVisible();
});

test('a move shows its evidence chain and the competitor profile its timeline', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Moves' }).click();
  await expect(page.getByRole('link', { name: /Price war · Smith HVAC/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Smith HVAC cut its AC tune-up/ })).toBeVisible();
  await page.getByRole('link', { name: 'Competitors' }).click();
  await page.getByRole('link', { name: 'Smith HVAC', exact: true }).click();
  await expect(page.getByRole('link', { name: /AC tune-up to \$79/ })).toBeVisible();
});

test('a stale ?event= or ?move= id keeps the page and says the item is gone', async ({ page }) => {
  const stale = '00000000-0000-4000-8000-00000000dead';
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1];
  const changes = await page.goto(`/c/${clientId}/changes?event=${stale}`);
  expect(changes?.status()).toBe(200);
  await expect(page.getByText('This change is no longer available.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Smith HVAC cut its AC tune-up to \$79/ })).toBeVisible();
  const moves = await page.goto(`/c/${clientId}/moves?move=${stale}`);
  expect(moves?.status()).toBe(200);
  await expect(page.getByText('This move is no longer available.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Price war · Smith HVAC/ })).toBeVisible();
});

test('the overview shows the KPIs, pressure and ad chart', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Competitor price moves')).toBeVisible();
  await expect(page.getByLabel(/Competitive pressure \d+ of 100/).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Active competitor ads per week/ })).toBeVisible();
});

test('the overview has no horizontal page scroll at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Competitor price moves')).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

test('alert rules refuse a brief above the alert and reset to the defaults', async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Alert rules' }).click();
  await page.getByLabel('Instant alert from score').fill('50');
  await page.getByLabel('Weekly brief from score').fill('60');
  await page.getByRole('button', { name: 'Save' }).click();
  // Next's route announcer is also role=alert, so scope to the form's message.
  await expect(page.getByRole('alert').filter({ hasText: 'lower than the alert' })).toBeVisible();
  await page.getByLabel('Weekly brief from score').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Alert rules saved.')).toBeVisible();
  await page.getByRole('button', { name: /Use the defaults/ }).click();
  await expect(page.getByText('Back to the default thresholds.')).toBeVisible();
});

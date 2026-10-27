import { expect, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));

test.use({ storageState: ADMIN_STATE });

test('the changes feed opens the evidence viewer with both snapshots and the text diff', { tag: ['@changes', '@evidence'] }, async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Changes', exact: true }).click();
  await page.getByRole('link', { name: /Smith HVAC cut its AC tune-up to \$79/ }).click();
  const shots = page.getByRole('img', { name: /snapshot of https:\/\/smithhvac\.example\/pricing/ });
  await expect(shots).toHaveCount(2);
  await expect.poll(() => shots.first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Text changes' }).click();
  await expect(page.locator('ins', { hasText: '$79' })).toBeVisible();
  await page.getByRole('link', { name: 'Capture details' }).click();
  await expect(page.getByText(/SHA-256/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Useful' }).click();
  await expect(page.getByText('Thanks — saved.')).toBeVisible();
});

test('at 390 px the change detail opens in a sheet that back closes and refresh keeps', { tag: ['@changes', '@responsive'] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/c/${clientId}/changes`);
  const item = page.getByRole('link', { name: /Smith HVAC cut its AC tune-up to \$79/ }).first();
  const sheet = page.getByRole('dialog');
  await expect(item).toBeVisible();
  await expect(sheet).toHaveCount(0);

  await item.click();
  await expect(sheet.getByText('Change details', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/event=/);

  await page.goBack();
  await expect(sheet).toHaveCount(0);

  await item.click();
  await expect(sheet).toBeVisible();
  await page.reload();
  await expect(sheet).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/event=/);
});

test('at 1440 px the change peek panel steps to the next change, back restores it and Escape closes to the row', { tag: ['@changes'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(`/c/${clientId}/changes?route=all&days=365`);
  const rows = page.getByRole('region', { name: 'Changes', exact: true }).getByRole('listitem').getByRole('link');
  await expect(rows.nth(1)).toBeVisible();
  const firstId = (await rows.nth(0).getAttribute('data-row-id'))!;
  const secondId = (await rows.nth(1).getAttribute('data-row-id'))!;
  const secondText = (await rows.nth(1).getByRole('heading').textContent())!;

  await rows.nth(0).click();
  await expect(page).toHaveURL(new RegExp(`event=${firstId}`));
  const panel = page.getByRole('region', { name: 'Change details' });
  await expect(panel.getByRole('link', { name: 'Close details' })).toBeVisible();

  await panel.getByRole('link', { name: 'Next change' }).click();
  await expect(page).toHaveURL(new RegExp(`event=${secondId}`));
  const summary = panel.getByRole('heading', { level: 2 });
  await expect(summary).toBeVisible();
  expect(secondText).toContain((await summary.textContent())!.trim());

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`event=${firstId}`));

  await panel.getByRole('link', { name: 'Next change' }).focus();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/event=/);
  await expect(rows.nth(0)).toBeFocused();
});

test('a move shows its evidence chain and the competitor profile its timeline', { tag: ['@moves', '@evidence', '@competitors'] }, async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Moves', exact: true }).click();
  await expect(page.getByRole('link', { name: /Price war · Smith HVAC/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Smith HVAC cut its AC tune-up/ })).toBeVisible();
  await page.getByRole('link', { name: 'Competitors', exact: true }).click();
  await page.getByRole('link', { name: 'Smith HVAC', exact: true }).click();
  await expect(page.getByRole('link', { name: /AC tune-up to \$79/ })).toBeVisible();
});

test('a stale ?event= or ?move= id keeps the page and says the item is gone', { tag: ['@changes', '@moves'] }, async ({ page }) => {
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

test('the overview shows the KPIs, pressure and ad chart', { tag: ['@overview'] }, async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Competitor price moves')).toBeVisible();
  await expect(page.getByLabel(/Competitive pressure \d+ of 100/).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Active competitor ads per week/ })).toBeVisible();
});

test('the overview has no horizontal page scroll at 390 px', { tag: ['@responsive', '@overview'] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await expect(page.getByText('Competitor price moves')).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

test('alert rules refuse a brief above the alert and reset to the defaults', { tag: ['@alert-rules'] }, async ({ page }) => {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.getByRole('link', { name: 'Client settings' }).first().click();
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Alert rules', exact: true }).click();
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

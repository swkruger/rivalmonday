import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { OWNER_LINK_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * Phase 13b: the E2E HVAC client has three weekly scans (the oldest on a 5×5 grid) and a manual scan two days ago
 * (seed.ts `seedWorkspace`), plus a stored map background.
 */
test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));

test.use({ storageState: ADMIN_STATE });

async function openRankings(page: Page): Promise<string> {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await page.goto(`/c/${clientId}/rankings`);
  await expect(page.getByRole('heading', { name: 'Local rankings', level: 1 })).toBeVisible();
  return clientId;
}

test('Trend is the default tab and the slider changes the grid\'s scan', { tag: ['@rankings'] }, async ({ page }) => {
  await openRankings(page);
  await expect(page.getByRole('tab', { name: 'Trend' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /Average map rank/ })).toBeVisible();
  await expect(page.getByText('Top 3 at 3 of 8 points · average rank 3.5').first()).toBeVisible();

  const slider = page.getByRole('slider', { name: 'Scan' });
  await expect(slider).toHaveAttribute('max', '3');
  await slider.focus();
  await page.keyboard.press('Home');
  const oldest = await slider.getAttribute('aria-valuetext');
  await page.waitForURL(/[?&]scan=[0-9a-f-]{36}/);
  await expect(page.getByText(`Scan of ${oldest} ·`)).toBeVisible();
  await expect(page.getByText('Top 3 at 0 of 8 points · average rank 4.6').first()).toBeVisible();
});

test('Compare shows the change grid and refuses mismatched settings', { tag: ['@rankings'] }, async ({ page }) => {
  await openRankings(page);
  await page.getByRole('tab', { name: 'Compare' }).click();
  await expect(page.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true');
  // The newest two scans share their settings.
  await expect(page.getByRole('img', { name: /Change in local rank for ac repair/ })).toBeVisible();

  // The oldest scan ran on a 5×5 grid.
  await page.getByLabel('From scan').selectOption({ index: 3 });
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByText('Settings changed between these scans.')).toBeVisible();
  await expect(page.getByRole('img', { name: /Change in local rank/ })).toHaveCount(0);
});

test('Scan now shows "Next scan available …" after a recent manual scan', { tag: ['@rankings'] }, async ({ page }) => {
  await openRankings(page);
  const button = page.getByRole('button', { name: /^Next scan available \w{3} \d{1,2} \w{3}$/ });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Scan now' })).toHaveCount(0);
});

test('Rank settings opens for an agency admin and saves', { tag: ['@rankings'] }, async ({ page }) => {
  await openRankings(page);
  await page.getByRole('button', { name: 'Rank settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Rank settings' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: 'ac repair' })).toBeChecked();
  await expect(sheet.getByLabel('Radius')).toHaveValue('25');
  await sheet.getByRole('radio', { name: '5×5' }).check();
  await sheet.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Saved. The next scan uses these settings.')).toBeVisible();
  await expect(sheet).toBeHidden();

  // The next opening starts from what was saved.
  await page.getByRole('button', { name: 'Rank settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Rank settings' }).getByRole('radio', { name: '5×5' })).toBeChecked();
});

test('the map image loads under the grid with attribution', { tag: ['@rankings'] }, async ({ page }) => {
  const clientId = await openRankings(page);
  const grid = page.getByRole('img', { name: /Local rankings for ac repair/ });
  await expect(grid).toBeVisible();
  const href = await grid.locator('image').getAttribute('href');
  expect(href).toMatch(new RegExp(`^/files/rank-map/${clientId}\\?v=`));
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  await expect(page.getByText('© Stadia Maps © OpenMapTiles © OpenStreetMap contributors').first()).toBeVisible();
});

test.describe('as the client owner', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a client viewer sees neither Rank settings nor Scan now', { tag: ['@rankings', '@guest'] }, async ({ page }) => {
    await page.goto((await readFile(OWNER_LINK_FILE, 'utf8')).trim());
    await page.getByRole('link', { name: 'Local rankings', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Local rankings', level: 1 })).toBeVisible();
    await expect(page.getByRole('img', { name: /Local rankings for ac repair/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rank settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Scan now|Next scan available|Scan running/ })).toHaveCount(0);
  });
});

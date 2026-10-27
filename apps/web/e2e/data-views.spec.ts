import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { OWNER_LINK_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));

test.use({ storageState: ADMIN_STATE });

async function openClient(page: Page): Promise<string> {
  await page.goto('/agency');
  await page.getByRole('link', { name: 'E2E HVAC' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}/);
  return /\/c\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('pricing shows the competitor card and opens a price history', { tag: ['@pricing'] }, async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Pricing', exact: true }).click();
  const tune = page.getByRole('link', { name: /AC tune-up/ });
  await expect(tune).toContainText('$79');
  await expect(tune).toContainText('▼ $20');
  await tune.click();
  await expect(page.getByRole('img', { name: /AC tune-up price history/ })).toBeVisible();
});

test('ads lists creatives with a library link', { tag: ['@ads'] }, async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Ads', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spring AC special' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View in Meta Ad Library' })).toHaveAttribute('href', /id=e2e-meta-1/);
  await expect(page.getByText('Targeting not disclosed (US)').first()).toBeVisible();
});

test('reviews shows the heatmap and searches review text', { tag: ['@reviews'] }, async ({ page }) => {
  const clientId = await openClient(page);
  await page.getByRole('link', { name: 'Reviews', exact: true }).click();
  await expect(page.getByRole('img', { name: /What customers talk about/ })).toBeVisible();
  await expect(page.getByText('The technician was late and pushy.')).toBeVisible();
  await page.goto(`/c/${clientId}/reviews?q=zzz`);
  await expect(page.getByRole('heading', { name: 'No reviews match' })).toBeVisible();
  await page.goto(`/c/${clientId}/reviews?topic=upsell_pressure`);
  await expect(page.getByText('The technician was late and pushy.')).toBeVisible();
  await expect(page.getByText('Fast and friendly service.')).toHaveCount(0);
  await expect(page.locator('select[name="topic"]')).toHaveValue('upsell_pressure');
  await page.goto(`/c/${clientId}/reviews?theme=upsell_pressure`);
  await expect(page.getByText('The technician was late and pushy.')).toBeVisible();
  await expect(page.getByText('Fast and friendly service.')).toBeVisible();
});

test('local rankings draws the geo-grid and share of voice', { tag: ['@rankings'] }, async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Local rankings', exact: true }).click();
  await expect(page.getByRole('img', { name: /Local rankings for ac repair/ })).toBeVisible();
  await expect(page.getByText('Top 3 at 3 of 8 points · average rank 3.5').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Share of top-3 local-pack slots/ })).toBeVisible();
});

test('the competitor profile shows prices, ads, reviews and rankings', { tag: ['@competitors', '@pricing', '@ads', '@reviews', '@rankings'] }, async ({ page }) => {
  await openClient(page);
  await page.getByRole('link', { name: 'Competitors', exact: true }).click();
  await page.getByRole('link', { name: 'Smith HVAC', exact: true }).click();
  await page.waitForURL(/\/competitors\/[0-9a-f-]{36}/);
  for (const name of ['Prices', 'Ads', 'Reviews', 'Local rankings']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /ac repair — top 3 at 8 of 8/ })).toBeVisible();
});

test.describe('as the client owner', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the nav lists the four data views when the client has the dashboard', { tag: ['@nav', '@guest'] }, async ({ page }) => {
    await page.goto((await readFile(OWNER_LINK_FILE, 'utf8')).trim());
    for (const name of ['Pricing', 'Ads', 'Reviews', 'Local rankings']) {
      await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
    }
  });
});

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no module page scrolls sideways (Review Focus 5)', { tag: ['@responsive', '@overview', '@pricing', '@ads', '@reviews', '@rankings', '@competitors'] }, async ({ page }) => {
    const clientId = await openClient(page);
    for (const path of ['', '/pricing', '/ads', '/reviews', '/rankings', '/competitors']) {
      await page.goto(`/c/${clientId}${path}`);
      expect(await noSideScroll(page), `${path || '/'} fits`).toBe(true);
    }
    await page.getByRole('link', { name: 'Smith HVAC', exact: true }).click();
    await page.waitForURL(/\/competitors\/[0-9a-f-]{36}/);
    expect(await noSideScroll(page), 'competitor profile fits').toBe(true);
  });

  test('the portfolio shows each client as a block with every field in view', { tag: ['@responsive', '@clients'] }, async ({ page }) => {
    await page.goto('/agency');
    const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'E2E HVAC' }) });
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('link', { name: /Approve Week of Oct 12/ })).toBeInViewport();
    await expect(card.getByText('Last activity')).toBeInViewport();
    await expect(page.getByRole('table')).toBeHidden();
    expect(await noSideScroll(page), 'portfolio fits').toBe(true);
  });

  test('the menu opens a drawer that navigates and closes', { tag: ['@responsive', '@nav', '@pricing'] }, async ({ page }) => {
    const clientId = await openClient(page);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Pricing', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${clientId}/pricing`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

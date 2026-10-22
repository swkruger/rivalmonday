import { expect, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * 15c-1 §3.5-3.6: neutral not-found and error pages. A refused or unknown page is a real HTTP 404 (never a 200 shell),
 * and a page that crashes keeps the sidebar and shows only the neutral copy plus a reference, never the error text.
 * `/e2e-throw` throws only while the Playwright server sets `E2E_THROW_PAGE=1`.
 */
test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));
test.use({ storageState: ADMIN_STATE });

test('unknown URL shows Page not found with status 404', { tag: ['@errors'] }, async ({ page }) => {
  const response = await page.goto('/no-such-page-15c');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByText("This page doesn't exist or you don't have access to it.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your home page' })).toHaveAttribute('href', '/');
  await expect(page).toHaveTitle('Page not found');
  expect(await page.content()).not.toMatch(/rival[\s-]*monday/i);
});

test('a page that throws keeps the sidebar and shows Something went wrong', { tag: ['@errors'] }, async ({ page }) => {
  await page.goto('/e2e-throw');
  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your home page' })).toBeVisible();
  await expect(page.getByText(/^Reference: \S+/)).toBeVisible();
  expect(await page.content()).not.toContain('secret detail');
});

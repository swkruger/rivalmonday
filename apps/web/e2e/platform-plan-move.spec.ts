import { expect, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * Phase 15c-3b: a platform owner publishes plan v2 without MCP, moves the seeded "Trial Agency E2E" (on v1) to it from the
 * Plans tab, then sees "Plan v2" on the agency page. Fake billing gateway; `admin@e2e.test` is a platform owner.
 */
const TARGET = 'Trial Agency E2E';

test('an owner publishes v2 without MCP and moves an agency from v1 to it', { tag: ['@platform', '@billing'] }, async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
  try {
    const page = await context.newPage();
    await page.goto('/platform/billing?tab=plans');

    await page.getByLabel('Base price ($/month)').fill('249');
    await page.getByLabel('Included seats').fill('3');
    await page.getByLabel('Extra seat ($/month)').fill('99');
    await page.getByLabel('Trial days').fill('30');
    await page.getByRole('checkbox', { name: 'MCP access' }).uncheck();
    await page.getByRole('button', { name: 'Publish new version' }).click();
    await page.getByRole('button', { name: 'Publish version' }).click();
    await expect(page.getByRole('cell', { name: 'v2', exact: true })).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: TARGET });
    await expect(row).toContainText('v1');
    await page.getByRole('checkbox', { name: `Select ${TARGET}` }).check();
    await page.getByRole('button', { name: 'Move selected to v2' }).click();
    await expect(page.getByRole('heading', { name: 'Move 1 agency to v2?' })).toBeVisible();
    await page.getByRole('button', { name: 'Move to v2' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Moved 1.' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: TARGET })).toHaveCount(0);

    await page.goto(`/platform/agencies?q=${encodeURIComponent(TARGET)}`);
    await page.getByRole('link', { name: TARGET, exact: true }).click();
    await expect(page.getByRole('heading', { name: TARGET, exact: true })).toBeVisible();
    await expect(page.getByText('Plan v2', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

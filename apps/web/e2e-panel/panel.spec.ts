import { expect, test } from '@playwright/test';

test('switch to DEMO, reset it, sign in as the agency admin and open Lone Star Cooling’s data pages (spec §8)', async ({ page }) => {
  await page.goto('/sign-in');
  const strip = page.locator('[data-rm-dev-panel]');
  await expect(strip).toHaveText('DEV · real data');
  await strip.click();
  await page.getByRole('button', { name: 'Switch to DEMO' }).click();
  await expect(page.locator('[data-rm-dev-panel]')).toHaveText('DEMO');

  const reset = page.getByRole('button', { name: 'Reset demo data' });
  await reset.click();
  await expect(page.getByTestId('reset-log')).toContainText('exit 0', { timeout: 600_000 });
  // The reset gives every demo contact a new id; the panel reloads its sign-in links after the log ends and only then
  // re-enables the button, so wait for that or a stale link would be clicked.
  await expect(reset).toBeEnabled();

  await page.getByRole('link', { name: 'Agency admin' }).click();
  await page.waitForURL(/\/agency$/);
  await page.getByRole('link', { name: 'Lone Star Cooling' }).first().click();
  await page.waitForURL(/\/c\/[0-9a-f-]{36}$/);
  const clientId = /\/c\/([0-9a-f-]{36})/.exec(page.url())![1]!;

  await page.goto(`/c/${clientId}/pricing`);
  await expect(page.getByRole('heading', { level: 1, name: 'Pricing' })).toBeVisible();
  await expect(page.getByText('Hill Country Air & Heat').first()).toBeVisible();
  await expect(page.getByText(/Prices come from competitor websites/)).toHaveCount(0);

  await page.goto(`/c/${clientId}/reviews`);
  await expect(page.getByRole('heading', { level: 1, name: 'Reviews & reputation' })).toBeVisible();
  await expect(page.getByText('Granbury Comfort Pros').locator('visible=true').first()).toBeVisible();

  await page.goto(`/c/${clientId}/rankings`);
  await expect(page.getByRole('heading', { level: 1, name: 'Local rankings' })).toBeVisible();
  await expect(page.getByText(/first monthly rank scan hasn’t run yet|Rank tracking starts once keywords/)).toHaveCount(0);

  // Leave the dev server's environment file on DEV for the next run.
  await page.locator('[data-rm-dev-panel]').click();
  await page.getByRole('button', { name: 'Switch to DEV' }).click();
  await expect(page.locator('[data-rm-dev-panel]')).toHaveText('DEV · real data');
});

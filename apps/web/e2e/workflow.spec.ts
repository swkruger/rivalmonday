import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('an admin adds a client and lands on its competitors page', async ({ page }) => {
  await signIn(page, 'admin@e2e.test', '/agency/clients/new');
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
  await signIn(page, 'admin@e2e.test', '/agency/approvals');
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
  await signIn(page, 'admin@e2e.test', '/agency/alerts');
  await expect(page.getByText('Smith HVAC started a $49 promo')).toBeVisible();
  await page.getByRole('button', { name: /dismiss/i }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill('Client already knows');
  await page.getByRole('dialog').getByRole('button', { name: /dismiss/i }).click();
  await expect(page.getByText('No alerts waiting — nice.')).toBeVisible();
});

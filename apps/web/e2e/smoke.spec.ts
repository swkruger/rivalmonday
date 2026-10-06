import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { OWNER_LINK_FILE } from '../playwright.config';
import { latestMagicLink } from './helpers';

test('an invited admin signs in by magic link and sees the themed client list', async ({ page }) => {
  await page.goto('/agency');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fagency/);
  await page.getByLabel(/email/i).fill('admin@e2e.test');
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  await page.goto(await latestMagicLink());
  await expect(page).toHaveURL(/\/agency$/);
  await expect(page.getByRole('link', { name: 'E2E HVAC' })).toBeVisible();
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  expect(primary.toLowerCase()).toBe('#7a3ee8');
  await page.getByRole('link', { name: 'E2E HVAC' }).click();
  await page.getByRole('link', { name: /week of/i }).first().click();
  await expect(page.getByText('Upsell: ppc_audit')).toBeVisible();
});

test('a client opens a signed email link as a read-only guest without agency data', async ({ page }) => {
  await page.goto((await readFile(OWNER_LINK_FILE, 'utf8')).trim());
  await expect(page.getByRole('heading', { name: 'Smith HVAC cut AC tune-ups to $59' })).toBeVisible();
  await expect(page.getByText(/viewing this through an email link/i)).toBeVisible();
  await expect(page.getByText(/ppc_audit/)).toHaveCount(0);
  const res = await page.goto('/agency');
  expect(res?.status()).toBe(404);
});

test('sign-in never redirects off-site (Review Focus 2)', async ({ page }) => {
  await page.goto('/sign-in?next=//evil.example/x');
  await page.getByLabel(/email/i).fill('admin@e2e.test');
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  await page.goto(await latestMagicLink());
  expect(new URL(page.url()).host).toBe('localhost:3100');
});

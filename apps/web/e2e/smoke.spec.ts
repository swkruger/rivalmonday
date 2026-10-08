import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { OWNER_LINK_FILE } from '../playwright.config';
import { requestMagicLink } from './helpers';

test('an invited admin signs in by magic link and sees the themed client list', async ({ page }) => {
  await page.goto('/agency');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fagency/);
  await page.goto(await requestMagicLink(page, 'admin@e2e.test'));
  await expect(page).toHaveURL(/\/agency$/);
  await expect(page.getByRole('link', { name: 'E2E HVAC' })).toBeVisible();
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  expect(primary.toLowerCase()).toBe('#7a3ee8');
  await page.getByRole('link', { name: 'E2E HVAC' }).click();
  // The Overview (5c-1) shows the latest brief — the seed's `ready` one for 2026-10-12 — with an "Open brief" link.
  await page.getByRole('link', { name: 'Open brief' }).click();
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

test('a guest opens the evidence behind a brief item and gets no agency-only pages', async ({ page }) => {
  await page.goto((await readFile(OWNER_LINK_FILE, 'utf8')).trim());
  const clientId = /\/c\/([0-9a-f-]{36})\//.exec(page.url())![1];
  await page.getByRole('link', { name: 'Evidence 1' }).click();
  await expect(page.getByRole('img', { name: /Snapshot of/ })).toBeVisible();
  await expect(page.getByText('SHA-256').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Useful' })).toHaveCount(0);
  const res = await page.goto(`/c/${clientId}/pitch-snapshot`);
  expect(res?.status()).toBe(404);
});

test('sign-in never redirects off-site (Review Focus 2)', async ({ page }) => {
  await page.goto('/sign-in?next=//evil.example/x');
  await page.goto(await requestMagicLink(page, 'admin@e2e.test'));
  expect(new URL(page.url()).host).toBe('localhost:3100');
});

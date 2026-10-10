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
  // The seed also has a `ready` brief for 2026-10-12 (the Overview's latest); this test is about the sent 2026-10-05 one,
  // listed under "Past briefs".
  await page.getByRole('link', { name: /week of 2026-10-05/i }).click();
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

test('a production build has no dev panel, even with DEV_PANEL=1 (spec §5.3, §8)', async ({ page, request }) => {
  await page.goto('/sign-in');
  await expect(page.locator('[data-rm-dev-panel]')).toHaveCount(0);
  for (const path of ['/dev-panel/api/state', '/dev-panel/api/links', '/dev-panel/sign-in/anything']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const post = await request.post('/dev-panel/api/switch', { headers: { 'x-rm-dev-panel': '1', origin: 'http://localhost:3100' }, data: { env: 'demo' } });
  expect(post.status()).toBe(404);
});

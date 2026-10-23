import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';

/**
 * Phase 9a billing, against the fake gateway. `seed.ts` adds two agencies that are not exempt pilots: "Trial Agency E2E"
 * (trialing, 3 active clients = its cap; admin + account manager) and "Paused Agency E2E" (suspended; admin + client
 * owner). The platform-console scenario uses `admin@e2e.test`, a platform owner. Nothing here clicks through to Stripe.
 */
const STATE = (name: string) => fileURLToPath(new URL(`../test-results/billing-${name}-state.json`, import.meta.url));
const USERS = {
  trialAdmin: 'trial-admin@e2e.test',
  trialAm: 'trial-am@e2e.test',
  pausedAdmin: 'paused-admin@e2e.test',
  pausedOwner: 'paused-owner@e2e.test',
} as const;
type Who = keyof typeof USERS;

const COPY_TEXT = "Copy link — it won't be shown again.";

async function ensureState(browser: Browser, testInfo: TestInfo, who: Who): Promise<void> {
  if (existsSync(STATE(who))) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await signIn(await context.newPage(), USERS[who], '/');
    await context.storageState({ path: STATE(who) });
  } finally {
    await context.close();
  }
}

async function as<T>(browser: Browser, testInfo: TestInfo, who: Who, fn: (page: Page) => Promise<T>): Promise<T> {
  await ensureState(browser, testInfo, who);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: STATE(who) });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe.serial('billing', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
  });

  test('a trial agency at its 3-client cap cannot add a 4th active client and is offered an Upgrade link', { tag: ['@billing', '@clients'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'trialAdmin', async (page) => {
      await page.goto('/agency/clients/new');
      // Phase 11a: the page opens on the business lookup; the by-hand form is the fallback below it.
      await page.getByRole('button', { name: /enter details by hand/i }).click();
      await page.getByLabel('Business name').fill('Fourth Client');
      await page.getByLabel('Business type', { exact: true }).selectOption('dental');
      await page.getByLabel(/search keywords/i).fill('dentist');
      await page.getByLabel(/map centre/i).fill('33.95, -84.33');
      await page.getByLabel(/radius/i).selectOption({ label: '10 mi' });
      await page.getByRole('button', { name: 'Create client' }).click();
      const alert = page.getByRole('alert').filter({ hasText: "You've used your 3 included clients. Upgrade to add more." });
      await expect(alert).toBeVisible();
      await expect(alert.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/agency/settings/billing');
    });
  });

  test('the billing page renders for the agency admin and is a 404 for an account manager', { tag: ['@billing'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'trialAdmin', async (page) => {
      await page.goto('/agency/settings/billing');
      await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
      await expect(page.getByText('Trial', { exact: true })).toBeVisible();
      await expect(page.getByText(/Seats: 3 of 3 included/)).toBeVisible();
      await expect(page.getByText('No invoices yet', { exact: true })).toBeVisible();
    });
    await as(browser, testInfo, 'trialAm', async (page) => {
      const response = await page.goto('/agency/settings/billing');
      expect(response?.status()).toBe(404);
    });
  });

  test('a suspended agency: the admin is kept on billing, its client user sees the paused page', { tag: ['@billing'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'pausedAdmin', async (page) => {
      await page.goto('/agency');
      await expect(page).toHaveURL(/\/agency\/settings\/billing$/);
      // A client-side navigation through the Settings sub-nav is sent back too.
      await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Runbook', exact: true }).click();
      await expect(page).toHaveURL(/\/agency\/settings\/billing$/);
      await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    });
    await as(browser, testInfo, 'pausedOwner', async (page) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/paused$/);
      await expect(page.getByText('This workspace is temporarily unavailable. Please contact Paused Agency E2E.')).toBeVisible();
    });
  });

  test('a platform owner creates a discount code and an invite link; the URL is shown once', { tag: ['@billing', '@platform'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/platform/billing?tab=codes');
      await page.getByLabel('Code', { exact: true }).fill('E2E-SPRING');
      await page.getByLabel(/amount/i).fill('20');
      await page.getByRole('button', { name: 'Create code' }).click();
      await expect(page.getByRole('cell', { name: 'E2E-SPRING' })).toBeVisible();

      await page.goto('/platform/billing?tab=signups');

      await page.getByLabel('Offer').selectOption('trial');
      await page.getByLabel('Note (optional)').fill('e2e invite');
      await page.getByRole('button', { name: 'Create link' }).click();
      await expect(page.getByText(COPY_TEXT)).toBeVisible();
      expect(await page.getByLabel('New invite link').inputValue()).toMatch(/^https?:\/\//);

      await page.reload();
      await expect(page.getByText(COPY_TEXT)).toHaveCount(0);
      await expect(page.getByLabel('New invite link')).toHaveCount(0);
      await expect(page.getByRole('cell', { name: 'e2e invite' })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { agency, agencyConnect, client, clientBilling, createDb } from '@cs/db';
import { eq } from 'drizzle-orm';
import { signIn } from './helpers';
import { CB_AGENCY, CB_CLIENT, CB_USERS } from './seed';

/**
 * Phase 9b client billing, against the fake gateway (an in-memory Stripe inside the web server). `seed.ts` adds "Metro Billing
 * Agency E2E" (an exempt pilot, so eligible) with one client, its admin, a client owner and a client viewer. The agency
 * connects through the real UI: under `BILLING_FAKE_GATEWAY=1` the fake opts into treating a second onboarding link as
 * "finished" (`completeOnboardingOnRelink`), and the billing page persists the live account state (R26). What Stripe's
 * payment webhooks would persist (a failed payment) is written straight to the test DB, because the connect webhook route
 * is deliberately closed to a production build running the fake gateway (R13); its handling is covered by the route and
 * billing package tests.
 */
const STATE = (who: Who) => fileURLToPath(new URL(`../test-results/client-billing-${who}-state.json`, import.meta.url));
type Who = keyof typeof CB_USERS;

async function ensureState(browser: Browser, testInfo: TestInfo, who: Who): Promise<void> {
  if (existsSync(STATE(who))) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await signIn(await context.newPage(), CB_USERS[who], who === 'admin' ? '/agency' : '/');
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

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

const ids = () => withDb(async (db) => {
  const [row] = await db.select({ agencyId: agency.id, clientId: client.id }).from(client).innerJoin(agency, eq(agency.id, client.agencyId)).where(eq(client.name, CB_CLIENT));
  return row!;
});

const row = (page: Page) => page.getByRole('row', { name: new RegExp(CB_CLIENT) });
const LEAK = /rival\s*monday/i;

test.describe.serial('client billing', () => {
  test('the agency admin connects Stripe, sets defaults and turns on billing for a client with an owner', { tag: ['@client-billing'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'admin', async (page) => {
      await page.goto('/agency/settings/billing');
      await expect(page.getByText('Client billing', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Connect Stripe' }).click();
      // The fake onboarding link returns straight to the page; the account exists but cannot take charges yet.
      await expect(page.getByText("Stripe setup isn't finished yet.")).toBeVisible();
      await page.getByRole('button', { name: 'Finish Stripe setup' }).click();
      await expect(page.getByText('Stripe is connected. Your clients pay you directly.')).toBeVisible();
    });

    // R26: showing the live connected state persisted it (no webhook needed), so enabling billing is allowed.
    const { agencyId } = await ids();
    const [stored] = await withDb((db) => db.select().from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)));
    expect(stored).toMatchObject({ status: 'connected', chargesEnabled: true });

    await as(browser, testInfo, 'admin', async (page) => {
      await page.goto('/agency/settings/billing');
      await page.getByLabel('Monthly price ($)').fill('199');
      await page.getByRole('button', { name: 'Save defaults' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Defaults saved.' })).toBeVisible();

      await page.goto('/agency');
      await expect(row(page)).toContainText('Off');
      await row(page).getByRole('button', { name: 'Billing actions' }).click();
      await page.getByRole('button', { name: 'Turn on billing' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Billing is on.' })).toBeVisible();
      await expect(row(page)).toContainText('Invited');
    });
  });

  test('the client owner sees an agency-branded Billing page; the client viewer gets a 404 and no Billing entry', { tag: ['@client-billing'] }, async ({ browser }, testInfo) => {
    const { clientId } = await ids();
    await as(browser, testInfo, 'owner', async (page) => {
      await page.goto(`/c/${clientId}`);
      // 15a §2.5: Billing is a Client settings tab (the sidebar foot opens the settings area).
      await page.getByRole('link', { name: 'Client settings', exact: true }).first().click();
      await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Billing', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/c/${clientId}/settings/billing$`));
      await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
      await expect(page.getByText(`Your plan with ${CB_AGENCY}`)).toBeVisible();
      await expect(page.getByText('Awaiting payment setup')).toBeVisible();
      await expect(page).toHaveTitle(`Billing · ${CB_AGENCY}`);
      expect(await page.locator('body').innerText()).not.toMatch(LEAK);
      expect(await page.title()).not.toMatch(LEAK);
    });
    await as(browser, testInfo, 'viewer', async (page) => {
      await page.goto(`/c/${clientId}`);
      await page.getByRole('link', { name: 'Client settings', exact: true }).first().click();
      const tabs = page.getByRole('navigation', { name: 'Settings' });
      await expect(tabs.getByRole('link', { name: 'Business profile', exact: true })).toBeVisible();
      await expect(tabs.getByRole('link', { name: 'Billing', exact: true })).toHaveCount(0);
      expect((await page.goto(`/c/${clientId}/settings/billing`))?.status()).toBe(404);
    });
  });

  test('the client owner sees credits on the Usage page and no questions block; the viewer gets a 404', { tag: ['@client-billing', '@usage'] }, async ({ browser }, testInfo) => {
    const { clientId } = await ids();
    await as(browser, testInfo, 'owner', async (page) => {
      await page.goto(`/c/${clientId}`);
      // The Usage tab sits in Client settings for the owner (15a §2.5).
      await page.getByRole('link', { name: 'Client settings', exact: true }).first().click();
      await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Usage', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/c/${clientId}/settings/usage$`));
      await expect(page.getByRole('heading', { name: 'Usage', exact: true, level: 1 })).toBeVisible();
      await expect(page.getByText('Credits this month')).toBeVisible();
      await expect(page.getByText(/of 1,500 credits/)).toBeVisible();
      await expect(page.getByText(/Ask questions/)).toHaveCount(0);
      await expect(page).toHaveTitle(`Usage · ${CB_AGENCY}`);
      expect(await page.locator('main').innerText()).not.toContain('$');
      expect(await page.locator('body').innerText()).not.toMatch(LEAK);
    });
    await as(browser, testInfo, 'viewer', async (page) => {
      expect((await page.goto(`/c/${clientId}/settings/usage`))?.status()).toBe(404);
    });
  });

  test('a failed payment shows Payment needed to the agency and the banner to the client owner only', { tag: ['@client-billing'] }, async ({ browser }, testInfo) => {
    const { clientId } = await ids();
    // What a completed Checkout followed by Stripe's invoice.payment_failed webhook leaves behind (the webhook route is
    // closed to the E2E server; the transition itself is covered by the billing package's tests).
    await withDb((db) => db.update(clientBilling).set({
      state: 'payment_needed', stripeSubscriptionId: 'sub_e2e_cb', stripeCustomerId: 'cus_e2e_cb', billedPriceCents: 19900, lastPaidAt: new Date(Date.now() - 35 * 86_400_000), paymentFailedSince: new Date(),
    }).where(eq(clientBilling.clientId, clientId)));

    await as(browser, testInfo, 'owner', async (page) => {
      await page.goto(`/c/${clientId}`);
      const banner = page.getByRole('region', { name: 'Billing' });
      await expect(banner).toContainText('Payment needed — please update your payment method.');
      await expect(banner.getByRole('link', { name: 'Update payment method' })).toHaveAttribute('href', `/c/${clientId}/settings/billing`);
      expect(await banner.innerText()).not.toMatch(LEAK);
    });
    await as(browser, testInfo, 'viewer', async (page) => {
      await page.goto(`/c/${clientId}`);
      await expect(page.getByRole('region', { name: 'Billing' })).toHaveCount(0);
    });
    await as(browser, testInfo, 'admin', async (page) => {
      await page.goto('/agency');
      await expect(row(page)).toContainText('Payment needed');
    });
  });

  test('pausing a client shows Paused and the paused banner to every client role; resuming restores the pill', { tag: ['@client-billing'] }, async ({ browser }, testInfo) => {
    const { clientId } = await ids();
    await as(browser, testInfo, 'admin', async (page) => {
      await page.goto('/agency');
      await row(page).getByRole('button', { name: 'Billing actions' }).click();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      // 15c-2a: pausing billing is confirmed in a dialog.
      await page.getByRole('dialog').getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Client paused.' })).toBeVisible();
      await expect(row(page)).toContainText('Paused');
    });
    for (const who of ['owner', 'viewer'] as const) {
      await as(browser, testInfo, who, async (page) => {
        await page.goto(`/c/${clientId}`);
        const banner = page.getByRole('region', { name: 'Billing' });
        await expect(banner).toContainText(`Monitoring is paused. Please contact ${CB_AGENCY}.`);
        expect(await banner.innerText()).not.toMatch(LEAK);
      });
    }
    await as(browser, testInfo, 'admin', async (page) => {
      await page.goto('/agency');
      await row(page).getByRole('button', { name: 'Billing actions' }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Client resumed.' })).toBeVisible();
      await expect(row(page)).toContainText('Payment needed');
      await expect(row(page)).not.toContainText('Paused');
    });
  });
});

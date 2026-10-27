import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { agency, billingNotice, client, clientBilling, createDb } from '@cs/db';
import { createFileTransport } from '@cs/email';
import { createEmailSender, dispatchDue } from '@cs/engine';
import { clientOwnerEmails } from '@cs/tools';
import { and, eq } from 'drizzle-orm';
import { OUTBOX } from '../playwright.config';
import { openMagicLink, outboxSnapshot, requestMagicLink, signIn } from './helpers';
import { SI_ADMIN, SI_AGENCY, SI_BILLING, SI_PENDING_OWNER, SI_STEP3, SI_STEP4 } from './seed';

/**
 * Phase 11b on seeded data (`seedInviteSetup`). No worker runs in E2E, so the spec drains the notification outbox itself
 * (`dispatchDue` with the file transport, exactly what the worker's dispatcher does) and reads the resulting email from
 * the outbox directory. Billing runs against the fake gateway (`BILLING_FAKE_GATEWAY`).
 */
const ADMIN_STATE = fileURLToPath(new URL('../test-results/si-admin-state.json', import.meta.url));
const OWNER_STATE = fileURLToPath(new URL('../test-results/si-owner-state.json', import.meta.url));

async function ensureAdmin(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(ADMIN_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await signIn(await context.newPage(), SI_ADMIN, '/agency');
    await context.storageState({ path: ADMIN_STATE });
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

const clientId = (name: string) => withDb(async (db) => {
  const [row] = await db.select({ id: client.id }).from(client).innerJoin(agency, eq(agency.id, client.agencyId)).where(and(eq(client.name, name), eq(agency.name, SI_AGENCY)));
  return row!.id;
});

type Mail = { to: string; cc?: string[]; from: string; subject: string; text: string };

/** Sends every due outbox row through the file transport, then returns the email to `to` that is not in `before`. */
async function dispatchAndRead(before: Set<string>, to: string): Promise<Mail> {
  await withDb((db) => dispatchDue({ db, senders: { email: createEmailSender({ transport: createFileTransport(OUTBOX), fromAddress: 'e2e@example.com' }) } }, new Date()));
  for (const f of (await readdir(OUTBOX)).filter((n) => n.endsWith('.json') && !before.has(n))) {
    const mail = JSON.parse(await readFile(join(OUTBOX, f), 'utf8')) as Mail;
    if (mail.to.toLowerCase() === to) return mail;
  }
  throw new Error(`no email to ${to} in the outbox after dispatch`);
}

async function fillInvite(page: Page, name: string, email: string): Promise<void> {
  await page.getByLabel("Owner's name").fill(name);
  await page.getByLabel("Owner's email").fill(email);
  await page.getByRole('button', { name: 'Send invite' }).click();
}

test.describe.serial('client setup: invite and billing', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdmin(browser, testInfo);
  });
  test.use({ storageState: ADMIN_STATE });

  // Without a connected Stripe account the billing step is skipped by itself, so connect first (through the real UI, as client-billing.spec does).
  test('the agency connects Stripe so the billing step applies', { tag: ['@setup', '@client-billing'] }, async ({ page }) => {
    await page.goto('/agency/settings/billing');
    await page.getByRole('button', { name: 'Connect Stripe' }).click();
    await page.getByRole('button', { name: 'Finish Stripe setup' }).click();
    await expect(page.getByText('Stripe is connected. Your clients pay you directly.')).toBeVisible();
    // No defaults are saved: the wizard's per-client price must work on its own (it creates the agency's Stripe product on first use).
  });

  test('staff invites the owner from step 4: Cc is the inviter and the email carries the sign-in link', { tag: ['@setup', '@clients'] }, async ({ page }) => {
    const id = await clientId(SI_STEP4);
    const owner = 'si-owner-four@e2e.test';
    await page.goto(`/c/${id}/setup`);
    await expect(page.getByRole('list', { name: 'Setup steps' }).getByText('Billing')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invite the owner' })).toBeVisible();
    const before = await outboxSnapshot();
    await fillInvite(page, 'Olive Four', owner);
    await expect(page.getByRole('status').filter({ hasText: 'Invite sent.' })).toBeVisible();

    const mail = await dispatchAndRead(before, owner);
    expect(mail.cc).toEqual([SI_ADMIN]);
    expect(mail.subject).toBe(`${SI_AGENCY} invited you to see your competitors`);
    expect(mail.from).toContain(SI_AGENCY);
    expect(mail.text + mail.subject).not.toMatch(/rival\s*monday/i);
    // Owners never enter setup (Phase 16 P8): the link lands on the overview.
    expect(mail.text).toContain(`/sign-in?email=${encodeURIComponent(owner)}&next=${encodeURIComponent(`/c/${id}`)}`);
    // Invited: the invite step is done and billing is now the current step.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
  });

  test('the invited owner follows the link, signs in with the email prefilled and lands on the overview', { tag: ['@setup', '@clients'] }, async ({ page, browser }, testInfo) => {
    const id = await clientId(SI_STEP3);
    const owner = 'si-owner-three@e2e.test';
    await page.goto(`/c/${id}/setup`);
    const before = await outboxSnapshot();
    await page.getByRole('button', { name: 'Invite the owner' }).click();
    await fillInvite(page, 'Olive Three', owner);
    await expect(page.getByRole('status').filter({ hasText: 'Invite sent.' })).toBeVisible();
    const mail = await dispatchAndRead(before, owner);
    const startUrl = /https?:\/\/\S+\/sign-in\?email=\S+/.exec(mail.text)?.[0];
    expect(startUrl).toBeTruthy();

    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const ownerPage = await context.newPage();
      await ownerPage.goto(startUrl!);
      await expect(ownerPage.getByLabel(/email/i)).toHaveValue(owner);
      await openMagicLink(ownerPage, await requestMagicLink(ownerPage, owner));
      await expect(ownerPage).toHaveURL(new RegExp(`/c/${id}$`));
      await context.storageState({ path: OWNER_STATE });
    } finally {
      await context.close();
    }
  });

  test('a client owner who was not asked to pick gets 404 on setup', { tag: ['@setup', '@client-billing'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: OWNER_STATE });
    try {
      const page = await context.newPage();
      // Phase 16 O12/P8: an owner reaches setup only while asked to pick competitors.
      expect((await page.goto(`/c/${await clientId(SI_STEP3)}/setup`))?.status()).toBe(404);
      // Another client of the same agency is a 404 for this owner.
      expect((await page.goto(`/c/${await clientId(SI_BILLING)}/setup`))?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test('an agency admin turns on billing at $249 + $99 setup; a payment-link notice is queued for the pending owner', { tag: ['@setup', '@client-billing'] }, async ({ page }) => {
    const id = await clientId(SI_BILLING);
    await page.goto(`/c/${id}/setup`);
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
    await page.getByLabel('Monthly price ($)').fill('249');
    await page.getByLabel('Setup fee ($)').fill('99');
    await page.getByRole('button', { name: 'Turn on billing and email the payment link' }).click();
    await expect(page.getByRole('dialog')).toContainText('The owner gets an email with a payment link for $249/month plus $99 setup.');
    await page.getByRole('dialog').getByRole('button', { name: 'Turn on billing', exact: true }).click();
    // Both remaining steps are done, so the setup closes into its summary.
    await expect(page.getByRole('heading', { name: 'Setup finished' })).toBeVisible();

    await withDb(async (db) => {
      const [bill] = await db.select().from(clientBilling).where(eq(clientBilling.clientId, id));
      expect(bill).toMatchObject({ enabled: true, state: 'invited', priceCents: 24900, setupFeeCents: 9900 });
      // Jobs are off in E2E, so the email is not sent here. The send is covered by apps/worker/src/jobs/billing-notices.test.ts
      // ("payment-link email reaches the pending owner's address"); this asserts the queued row and that the recipients include the pending owner.
      const [notice] = await db.select().from(billingNotice).where(and(eq(billingNotice.clientId, id), eq(billingNotice.kind, 'client-payment-link')));
      expect(notice).toMatchObject({ audience: 'client', sentAt: null });
      expect(await clientOwnerEmails(db as never, id, new Date())).toEqual([SI_PENDING_OWNER]);
    });
  });
});

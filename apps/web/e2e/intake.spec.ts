import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { agency, client, createDb, lead, notification } from '@cs/db';
import { createFileTransport } from '@cs/email';
import { createEmailSender, dispatchDue } from '@cs/engine';
import { and, eq } from 'drizzle-orm';
import { OUTBOX } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { outboxSnapshot, signIn } from './helpers';
import { IN_LEAD, IN_POOL, IN_SLUG, SI_ADMIN, SI_AGENCY } from './seed';

/**
 * Phase 11c on seeded data (`seedIntake`): the Invite Setup agency has an intake link `/start/<slug>`, a verified lead with a
 * ready preview and a verified pool lead. No worker runs in E2E, so previews are seeded and the `lead-preview` job never runs
 * (a fresh submission's preview stays "Building…"). Turnstile is the fake verifier and the business search is `SETUP_FAKE_LOOKUP`.
 * Lead emails are direct sends (file outbox); `client_invite` is a `notification` row drained like `client-setup-invite.spec.ts`.
 */
const SI_STATE = fileURLToPath(new URL('../test-results/si-admin-state.json', import.meta.url));

async function ensureSiAdmin(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(SI_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await signIn(await context.newPage(), SI_ADMIN, '/agency');
    await context.storageState({ path: SI_STATE });
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

type Mail = { to: string; from: string; subject: string; text: string };

/** The first email to `to` that is not in `before` (direct sends land shortly after the response, so poll up to 10 s). */
async function waitForMail(before: Set<string>, to: string): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    for (const f of (await readdir(OUTBOX).catch(() => [] as string[])).filter((n) => n.endsWith('.json') && !before.has(n))) {
      try {
        const mail = JSON.parse(await readFile(join(OUTBOX, f), 'utf8')) as Mail;
        if (mail.to.toLowerCase() === to) return mail;
      } catch {
        // still being written
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email to ${to} in the outbox within 10 s`);
}

/** The lead card: the innermost block holding both the business heading and its Accept button. */
const leadCard = (page: Page, business: string) =>
  page.locator('div').filter({ has: page.getByRole('heading', { name: business }) }).filter({ has: page.getByRole('button', { name: 'Accept', exact: true }) }).last();

test.describe.serial('client intake and leads', () => {
  test('a visitor finds their business, submits, opens the emailed link and sees their snapshot page', { tag: ['@leads'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const visitor = 'visitor-one@e2e.test';
      await page.goto(`/start/${IN_SLUG}`);
      await expect(page.getByRole('heading', { name: 'Get your free competitor snapshot' })).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/rival\s*monday/i);
      await page.getByLabel('Business name').fill('Granbury dentist');
      await page.getByLabel('City and state, or ZIP').fill('Granbury, TX');
      await page.getByRole('button', { name: 'Find my business' }).click();
      const card = page.getByRole('button', { name: /Granbury Park Dental/ });
      await expect(card).toContainText('Owner-verified');
      await card.click();
      await page.getByLabel('Your name').fill('Vera Visitor');
      await page.getByLabel('Email', { exact: true }).fill(visitor);
      await page.getByLabel('I agree to be contacted about my request.').check();
      const before = await outboxSnapshot();
      await page.getByRole('button', { name: 'Get my free snapshot' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toBeVisible();

      const mail = await waitForMail(before, visitor);
      expect(mail.from).toContain(SI_AGENCY);
      expect(mail.text + mail.subject).not.toMatch(/rival\s*monday/i);
      const link = /https?:\/\/\S+\/start\/verify\/\S+/.exec(mail.text)?.[0];
      expect(link, 'the lead_verify email carries the verify link').toBeTruthy();
      await withDb(async (db) => {
        const [row] = await db.select({ status: lead.status }).from(lead).where(eq(lead.email, visitor));
        expect(row?.status).toBe('unverified');
      });

      await page.goto(link!);
      await expect(page).toHaveURL(/\/start\/v\/[0-9a-f-]{36}\?t=/);
      await expect(page.getByRole('heading', { name: 'Your competitor snapshot for Granbury Park Dental' })).toBeVisible();
      // No worker runs in E2E, so the preview is still being built.
      await expect(page.getByText('Building your snapshot…')).toBeVisible();
      await withDb(async (db) => {
        const [row] = await db.select({ status: lead.status }).from(lead).where(eq(lead.email, visitor));
        expect(row?.status).toBe('verified');
      });
      // The link is reusable until it expires (a mail scanner may open it first): a second open issues a fresh view token.
      await page.goto(link!);
      await expect(page.getByRole('heading', { name: 'Your competitor snapshot for Granbury Park Dental' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('an unknown intake page and a bad preview token are 404s', { tag: ['@leads'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      expect((await page.goto('/start/no-such-agency'))?.status()).toBe(404);
      expect((await page.goto('/start/v/00000000-0000-4000-8000-000000000000?t=nope'))?.status()).toBe(404);
      await page.goto('/start/verify/not-a-real-token');
      await expect(page).toHaveURL(/\/start\/verify$/);
      await expect(page.getByRole('heading', { name: 'This link has expired.' })).toBeVisible();
      await page.goto('/start');
      await expect(page.getByRole('heading', { name: 'Get your free competitor snapshot' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('preview renders with submit disabled', { tag: ['@leads'] }, async ({ browser }, testInfo) => {
    await ensureSiAdmin(browser, testInfo);
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: SI_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/agency/settings/intake');
      await page.getByRole('link', { name: 'Preview your page' }).click();
      await expect(page).toHaveURL(/\/agency\/settings\/intake\/preview$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Intake preview' })).toBeVisible();
      await expect(page.getByText('Preview — this is what visitors see')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Find my business' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Get my free snapshot' })).toBeDisabled();
    } finally {
      await context.close();
    }
  });

  test('the agency accepts a lead, lands in its setup, and the contact is invited', { tag: ['@leads', '@setup', '@prospects'] }, async ({ browser }, testInfo) => {
    await ensureSiAdmin(browser, testInfo);
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: SI_STATE });
    try {
      const page = await context.newPage();
      await page.goto('/agency/leads');
      const card = leadCard(page, IN_LEAD.business);
      await expect(card.getByText('From your website')).toBeVisible();
      await expect(card.getByText('One nearby dentist has a higher rating than you.')).toBeVisible();
      await card.getByRole('button', { name: 'Accept', exact: true }).click();
      await card.getByRole('button', { name: `Accept and invite ${IN_LEAD.contact}` }).click();
      await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/setup$/);
      const clientId = /\/c\/([0-9a-f-]{36})\/setup/.exec(page.url())![1]!;

      await withDb(async (db) => {
        const [c] = await db.select({ status: client.status, name: client.name }).from(client).where(eq(client.id, clientId));
        expect(c).toMatchObject({ status: 'prospect', name: IN_LEAD.business });
        const [l] = await db.select({ status: lead.status, clientId: lead.clientId }).from(lead).where(eq(lead.email, IN_LEAD.email));
        expect(l).toMatchObject({ status: 'accepted', clientId });
        const [n] = await db.select({ address: notification.address }).from(notification).where(and(eq(notification.clientId, clientId), eq(notification.kind, 'client_invite')));
        expect(n?.address?.toLowerCase()).toBe(IN_LEAD.email);
        // Drain the outbox as the worker's dispatcher would: the invite reaches the (inactive) contact, agency-branded.
        const before = await outboxSnapshot();
        await dispatchDue({ db, senders: { email: createEmailSender({ transport: createFileTransport(OUTBOX), fromAddress: 'e2e@example.com' }) } }, new Date());
        const mail = await waitForMail(before, IN_LEAD.email);
        expect(mail.from).toContain(SI_AGENCY);
        expect(mail.text + mail.subject).not.toMatch(/rival\s*monday/i);
      });

      // It now sits under Accepted, with a link to the setup.
      await page.goto('/agency/leads?tab=accepted');
      await expect(page.getByRole('heading', { name: IN_LEAD.business })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open setup' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('a platform operator assigns a pool lead and the agency sees it', { tag: ['@leads', '@platform'] }, async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await ensureSiAdmin(browser, testInfo);
    const agencyName = SI_AGENCY;

    const op = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: ADMIN_STATE });
    try {
      const page = await op.newPage();
      await page.goto('/platform/leads');
      const row = page.getByRole('row').filter({ hasText: IN_POOL.business });
      await expect(row).toBeVisible();
      const value = await row.getByRole('option').filter({ hasText: agencyName }).getAttribute('value');
      await row.getByLabel('Agency').selectOption(value);
      await row.getByRole('button', { name: 'Assign' }).click();
      await expect(page.getByRole('row').filter({ hasText: IN_POOL.business }).getByRole('button', { name: 'Assign' })).toHaveCount(0);
      // "Recent assignments": one row naming both the business and the agency.
      const recent = page.getByText('Recent assignments', { exact: true }).locator('xpath=ancestor::*[.//table][1]');
      await expect(recent.getByRole('row').filter({ hasText: IN_POOL.business }).filter({ hasText: agencyName })).toHaveCount(1);
      await withDb(async (db) => {
        const [row] = await db.select({ agencyName: agency.name, assignedAt: lead.assignedAt, status: lead.status }).from(lead).innerJoin(agency, eq(agency.id, lead.agencyId)).where(eq(lead.email, IN_POOL.email));
        expect(row?.agencyName).toBe(SI_AGENCY);
        expect(row?.assignedAt).not.toBeNull();
        expect(row?.status).toBe('verified');
      });
    } finally {
      await op.close();
    }

    const ag = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: SI_STATE });
    try {
      const page = await ag.newPage();
      await page.goto('/agency/leads');
      const card = leadCard(page, IN_POOL.business);
      await expect(card.getByText('From the platform')).toBeVisible();
      expect(await card.textContent()).not.toMatch(/rival\s*monday/i);
    } finally {
      await ag.close();
    }
  });
});

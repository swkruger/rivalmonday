import { createDb } from '@cs/db';
import { expect, type Page, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { hostsFixture } from './helpers';

/**
 * 13a1 Domains page (`/agency/settings/domains`) with the fake Vercel/Postmark vendors (`DOMAINS_FAKE_VENDORS=1`). No worker
 * runs in E2E, so the verify jobs' outcomes (live / verified) are written to the database directly. E2E Agency's rows are
 * marked removed afterwards so no other spec sees a live custom host.
 */
test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));
test.use({ storageState: ADMIN_STATE });

const HOSTNAME = 'intel.e2e-agency-web.com';
const SENDING = 'e2e-agency-mail.com';

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

/** Idempotent: every non-removed E2E Agency domain row (whatever its hostname) and this spec's rows are marked removed. */
const removeAll = () => withDb(async (db) => {
  const agency = sql`(select id from agency where host_slug = ${hostsFixture().slug})`;
  await db.execute(sql`update agency_domain set status = 'removed', removed_at = now() where (agency_id = ${agency} or hostname = ${HOSTNAME}) and status <> 'removed'`);
  await db.execute(sql`update agency_sending_domain set status = 'removed' where (agency_id = ${agency} or domain = ${SENDING}) and status <> 'removed'`);
});
// A crashed earlier run must not leave E2E Agency with a live custom domain (its slug host would turn non-canonical).
test.beforeAll(removeAll);
test.afterAll(removeAll);

const panel = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function confirmRemove(page: Page, section: ReturnType<typeof panel>, title: string) {
  await section.getByRole('button', { name: 'Remove', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(title)).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('domains page: set → pending with records, (DB) live → live, remove → fallback', { tag: ['@domains', '@settings', '@nav'] }, async ({ page }) => {
  await removeAll();
  const fallback = `${hostsFixture().slug}.localhost`;
  await page.goto('/agency/settings');
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Domains' }).click();
  await expect(page).toHaveURL(/\/agency\/settings\/domains$/);
  await expect(page.getByRole('heading', { name: 'Domains', level: 1 })).toBeVisible();

  const web = panel(page, 'Web address');
  await expect(web.getByText(`Until then, clients use ${fallback}.`)).toBeVisible();
  await web.getByLabel('Domain').fill(HOSTNAME.toUpperCase());
  await web.getByRole('button', { name: 'Save' }).click();

  // Pending: the stored (normalised) hostname, the chip, the CNAME record with its copy button, still on the fallback host.
  await expect(web.getByText(HOSTNAME, { exact: true }).first()).toBeVisible();
  await expect(web.getByText('Waiting for DNS')).toBeVisible();
  const row = web.getByRole('row').filter({ hasText: 'CNAME' });
  await expect(row).toContainText(HOSTNAME);
  await expect(row.getByRole('button', { name: `Copy CNAME value for ${HOSTNAME}` })).toBeVisible();
  await expect(web.getByText(`Until then, clients use ${fallback}.`)).toBeVisible();

  // The verify job's outcome (no worker in E2E): live.
  await withDb((db) => db.execute(sql`update agency_domain set status = 'live', live_at = now(), dns_records = '[]'::jsonb where hostname = ${HOSTNAME} and status <> 'removed'`));
  await page.reload();
  await expect(web.getByText('Live', { exact: true })).toBeVisible();
  await expect(web.getByText(/^since /)).toBeVisible();
  await expect(web.getByText(`Until then, clients use ${fallback}.`)).toHaveCount(0);
  await expect(web.getByRole('row').filter({ hasText: 'CNAME' })).toHaveCount(0);

  await confirmRemove(page, web, `Remove ${HOSTNAME}?`);
  await expect(web.getByLabel('Domain')).toBeVisible();
  await expect(web.getByText(`Until then, clients use ${fallback}.`)).toBeVisible();
  await expect(web.getByText(HOSTNAME, { exact: true })).toHaveCount(0);
});

test('sending: set → records, (DB) verified → From shows the domain', { tag: ['@domains', '@settings'] }, async ({ page }) => {
  await removeAll();
  const fallbackFrom = `${hostsFixture().slug}@mail.localhost`;
  await page.goto('/agency/settings/domains');
  const sending = panel(page, 'Email sending');
  await expect(sending).toContainText(fallbackFrom);

  await sending.getByLabel('Email domain').fill(SENDING);
  await expect(sending.getByLabel('Address name')).toHaveValue('briefs');
  await sending.getByRole('button', { name: 'Save' }).click();

  // Pending: DKIM (TXT) and Return-Path (CNAME) records; client email still comes from the fallback address.
  await expect(sending.getByText(SENDING, { exact: true }).first()).toBeVisible();
  await expect(sending.getByText('Waiting for DNS')).toBeVisible();
  await expect(sending.getByRole('row').filter({ hasText: 'TXT' })).toHaveCount(1);
  await expect(sending.getByRole('row').filter({ hasText: 'CNAME' })).toHaveCount(1);
  await expect(sending).toContainText(fallbackFrom);

  // The verify job's outcome (no worker in E2E): verified, with a DMARC record.
  await withDb((db) => db.execute(sql`update agency_sending_domain set status = 'verified', verified_at = now(), dmarc_ok = true where domain = ${SENDING} and status <> 'removed'`));
  await page.reload();
  await expect(sending.getByText('Verified', { exact: true })).toBeVisible();
  await expect(sending).toContainText(`briefs@${SENDING}`);
  await expect(sending).not.toContainText(fallbackFrom);
  await expect(sending.getByRole('row')).toHaveCount(0);

  await confirmRemove(page, sending, `Remove ${SENDING}?`);
  await expect(sending.getByLabel('Email domain')).toBeVisible();
  await expect(sending).toContainText(fallbackFrom);
});

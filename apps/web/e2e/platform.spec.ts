import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { hashInput } from '@cs/core/server';
import { agency, createDb } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { eq, sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { ARCHIVE_AGENCY, MANAGE_ADMIN, MANAGE_AGENCY } from './seed';

/**
 * Phase 8a platform console. `admin@e2e.test` is an agency admin AND a platform operator (PLATFORM_ADMIN_EMAILS);
 * `plain-admin@e2e.test` is an agency admin of the same agency who is not an operator.
 */
const PLAIN_STATE = fileURLToPath(new URL('../test-results/plain-admin-state.json', import.meta.url));
const PLAIN = 'plain-admin@e2e.test';
const ROUTES = ['/platform', '/platform/agencies', '/platform/health'] as const;

async function ensurePlainState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(PLAIN_STATE)) return;
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [a] = await db.select({ id: agency.id }).from(agency).where(eq(agency.name, 'E2E Agency'));
    await createInvitation(db, { agencyId: a!.id, email: PLAIN, role: 'agency_admin', invitedBy: 'e2e-platform' });
  } finally {
    await close();
  }
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, PLAIN);
  await expect(page).toHaveURL(/\/agency$/);
  await context.storageState({ path: PLAIN_STATE });
  await context.close();
}

async function as<T>(browser: Browser, testInfo: TestInfo, state: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: state });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe.serial('platform console', () => {
  let agencyId = '';
  let agencyName = '';

  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await ensurePlainState(browser, testInfo);
  });

  test('the operator sees the overview tiles', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      const res = await page.goto('/platform');
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Overview', exact: true, level: 1 })).toBeVisible();
      for (const title of ['Agencies', 'Active clients', 'Weekly active users', 'Spend this month']) {
        await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
      }
    });
  });

  test('the operator opens the first agency from the list and its detail renders', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await page.goto('/platform/agencies');
      await expect(page.getByRole('heading', { name: 'Agencies', exact: true })).toBeVisible();
      const first = page.locator('a[href^="/platform/agencies/"]').first();
      agencyName = (await first.innerText()).trim();
      await first.click();
      await expect(page).toHaveURL(/\/platform\/agencies\/[0-9a-f-]{36}$/);
      agencyId = page.url().split('/').pop()!;
      await expect(page.getByRole('heading', { name: agencyName, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Manage', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
    });
  });

  test("opening the detail left a platform_ row in that agency's audit trail", { tag: ['@platform'] }, async () => {
    expect(agencyId).not.toBe('');
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await expect
        .poll(async () => {
          const rows = [...(await db.execute<{ n: number }>(sql`
            select count(*)::int as n from audit_log
            where agency_id = ${agencyId}::uuid and tool = 'get_platform_agency' and role like 'platform\_%'`))];
          return rows[0]?.n ?? 0;
        })
        .toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  test('a plain agency admin gets 404 on the platform pages', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, PLAIN_STATE, async (page) => {
      for (const route of [...ROUTES, `/platform/agencies/${agencyId || '00000000-0000-0000-0000-000000000000'}`]) {
        const res = await page.goto(route);
        expect(res?.status(), route).toBe(404);
      }
    });
  });
});

/**
 * Phase 15c-3a agency management. `seed.ts` adds two dedicated exempt-pilot agencies (no Stripe subscription): MANAGE_AGENCY
 * (hold + invite resend; its admin is MANAGE_ADMIN) and ARCHIVE_AGENCY. The operator is `admin@e2e.test`, a platform owner.
 */
const MANAGE_STATE = fileURLToPath(new URL('../test-results/manage-admin-state.json', import.meta.url));
const HOLD_SENTENCE = /This account is on hold\. Contact .+ to restore it\./;

async function openAgency(page: Page, name: string): Promise<void> {
  await page.goto(`/platform/agencies?q=${encodeURIComponent(name)}`);
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(/\/platform\/agencies\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
}

async function agencyIdOf(name: string): Promise<string> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [a] = await db.select({ id: agency.id }).from(agency).where(eq(agency.name, name));
    return a!.id;
  } finally {
    await close();
  }
}

test.describe.serial('agency management', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    if (existsSync(MANAGE_STATE)) return;
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
    try {
      await signIn(await context.newPage(), MANAGE_ADMIN);
      await context.storageState({ path: MANAGE_STATE });
    } finally {
      await context.close();
    }
  });

  // A failure mid-way must not leave the agency on hold for the later specs.
  test.afterAll(async () => {
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      await db.execute(sql`update agency set suspended_at = null, suspended_reason = null, suspended_by = null where name = ${MANAGE_AGENCY}`);
    } finally {
      await close();
    }
  });

  test('staff puts an agency on hold and lifts it', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    // Control: before the hold the add-client form is editable, so the disabled state below is caused by the hold.
    await as(browser, testInfo, MANAGE_STATE, async (page) => {
      await page.goto('/agency/clients/new');
      await expect(page.getByLabel('Business name')).toBeEnabled();
    });
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await openAgency(page, MANAGE_AGENCY);
      await page.getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Put on hold' }).click();
      await page.getByLabel('Reason (staff only)').fill('E2E: payment dispute');
      await page.getByRole('button', { name: 'Put on hold' }).click();
      await expect(page.getByText('On hold', { exact: true }).first()).toBeVisible();
    });
    await as(browser, testInfo, MANAGE_STATE, async (page) => {
      await page.goto('/agency');
      await expect(page.getByText(HOLD_SENTENCE)).toBeVisible();
      await page.goto('/agency/clients/new');
      // While held the whole app is read-only: the add-client fields are disabled.
      await expect(page.getByLabel('Business name')).toBeDisabled();
    });
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await openAgency(page, MANAGE_AGENCY);
      await page.getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Lift hold' }).click();
      await page.getByRole('button', { name: 'Lift hold' }).click();
      await expect(page.getByText('On hold', { exact: true })).toHaveCount(0);
    });
    await as(browser, testInfo, MANAGE_STATE, async (page) => {
      await page.goto('/agency');
      await expect(page.getByText(HOLD_SENTENCE)).toHaveCount(0);
      await page.goto('/agency/clients/new');
      await expect(page.getByLabel('Business name')).toBeEnabled();
    });
  });

  test('owner archives and unarchives an agency without billing', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await openAgency(page, ARCHIVE_AGENCY);
      await page.getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Archive agency' }).click();
      await page.getByLabel(`Type ${ARCHIVE_AGENCY} to confirm`).fill(ARCHIVE_AGENCY);
      await page.getByRole('button', { name: 'Archive agency' }).click();
      await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();

      await page.goto(`/platform/agencies?q=${encodeURIComponent(ARCHIVE_AGENCY)}`);
      await expect(page.getByRole('link', { name: ARCHIVE_AGENCY, exact: true })).toHaveCount(0);
      await page.goto(`/platform/agencies?status=archived&q=${encodeURIComponent(ARCHIVE_AGENCY)}`);
      await expect(page.getByRole('link', { name: ARCHIVE_AGENCY, exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Unarchive' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Unarchive' }).click();
      await expect(page.getByRole('link', { name: ARCHIVE_AGENCY, exact: true })).toHaveCount(0);
      await page.goto(`/platform/agencies?q=${encodeURIComponent(ARCHIVE_AGENCY)}`);
      await expect(page.getByRole('link', { name: ARCHIVE_AGENCY, exact: true })).toBeVisible();
    });
  });

  test('invite agency admin, resend limit', { tag: ['@platform'] }, async ({ browser }, testInfo) => {
    const email = 'resend-target@e2e.test';
    const agencyId = await agencyIdOf(MANAGE_AGENCY);
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      const { id: invitationId } = await createInvitation(db, { agencyId, email, role: 'account_manager', invitedBy: 'e2e-platform' });
      // Three resends already happened in the window (the shared limit counts `resend_invitation` audit rows).
      for (let i = 0; i < 3; i++) {
        await db.execute(sql`
          insert into audit_log (agency_id, user_id, role, tool, input_hash, outcome, duration_ms)
          values (${agencyId}::uuid, 'e2e-seed', 'agency_admin', 'resend_invitation', ${hashInput({ invitationId })}, 'ok', 1)`);
      }
    } finally {
      await close();
    }
    await as(browser, testInfo, ADMIN_STATE, async (page) => {
      await page.goto(`/platform/agencies/${agencyId}?people=invites`);
      await page.getByRole('button', { name: `Resend invite to ${email}` }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Resend' }).click();
      await expect(page.getByRole('dialog').getByText('You can resend this invite again tomorrow.')).toBeVisible();
    });
  });
});

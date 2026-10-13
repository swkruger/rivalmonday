import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import { createDb } from '@cs/db';
import { sql } from 'drizzle-orm';
import { newMagicLink, outboxSnapshot } from './helpers';

/**
 * Phase 8b read-only support sessions. `staff@e2e.test` and `viewer-op@e2e.test` are platform operators (a
 * `platform_admin` row, written below once their first sign-in has created the auth user) who are also members of the
 * house agency (R7); `target-admin@e2e.test` administers "Support Target Agency", the agency the staff user opens.
 * The tests share one operator, and a user has one open session at a time, so they run serially on purpose.
 */
const STATE = (name: string) => fileURLToPath(new URL(`../test-results/support-${name}-state.json`, import.meta.url));
const USERS = {
  staff: { email: 'staff@e2e.test', role: 'staff' },
  viewer: { email: 'viewer-op@e2e.test', role: 'viewer' },
  target: { email: 'target-admin@e2e.test', role: null },
} as const;
type Who = keyof typeof USERS;
const REFUSAL = 'Read-only support session — changes are disabled.';

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

/** How long `signInPolling` keeps retrying a rate-limited magic-link request (the limit window is 60 s). */
const RATE_LIMIT_BUDGET_MS = 90_000;
const RATE_LIMIT_POLL_MS = 5_000;

/**
 * Magic links are rate-limited per IP across the whole run. Only that signal (HTTP 429 from the magic-link endpoint)
 * is retried, polling every few seconds until the window clears; any other failure fails at once.
 */
async function signInPolling(page: Page, email: string): Promise<void> {
  const deadline = Date.now() + RATE_LIMIT_BUDGET_MS;
  await page.goto('/sign-in?next=%2Fagency');
  for (;;) {
    const before = await outboxSnapshot();
    await page.getByLabel(/email/i).fill(email);
    const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/sign-in/magic-link'));
    await page.getByRole('button', { name: /email me a sign-in link/i }).click();
    if ((await response).status() !== 429) {
      await expect(page).toHaveURL(/check-email/);
      await page.goto(await newMagicLink(before, email));
      return;
    }
    if (Date.now() > deadline) throw new Error(`magic-link rate limit for ${email} did not clear within ${RATE_LIMIT_BUDGET_MS / 1000} s`);
    await page.waitForTimeout(RATE_LIMIT_POLL_MS);
  }
}

async function ensureState(browser: Browser, testInfo: TestInfo, who: Who): Promise<void> {
  const path = STATE(who);
  if (existsSync(path)) return;
  const u = USERS[who];
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await signInPolling(page, u.email);
    await expect(page).toHaveURL(/\/agency$/, { timeout: 15_000 });
    await context.storageState({ path });
  } finally {
    await context.close();
  }
  if (u.role) {
    await withDb(async (db) => {
      await db.execute(sql`
        insert into platform_admin (user_id, role, created_by)
        select id, ${u.role}, 'e2e-support' from auth."user" where email = ${u.email}
        on conflict do nothing`);
    });
  }
}

async function as<T>(browser: Browser, testInfo: TestInfo, who: Who, fn: (page: Page) => Promise<T>, viewport?: { width: number; height: number }): Promise<T> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: STATE(who), viewport });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

async function targetIds(): Promise<{ agencyId: string; clientId: string }> {
  return withDb(async (db) => {
    const rows = [...(await db.execute<{ agency_id: string; client_id: string }>(sql`
      select a.id as agency_id, c.id as client_id from agency a join client c on c.agency_id = a.id where a.name = 'Support Target Agency'`))];
    return { agencyId: rows[0]!.agency_id, clientId: rows[0]!.client_id };
  });
}

/** Staff: console page → "View as agency" → reason → "Start read-only session". Lands on `/agency`. */
async function startSession(page: Page, agencyId: string, reason: string): Promise<void> {
  await page.goto(`/platform/agencies/${agencyId}`);
  await page.getByRole('button', { name: 'View as agency' }).click();
  await page.getByLabel('Why are you opening this agency? (shown to the agency)').fill(reason);
  await page.getByRole('button', { name: 'Start read-only session' }).click();
  await expect(page).toHaveURL(/\/agency$/);
}

const banner = (page: Page) => page.getByRole('region', { name: 'Support session' });

test.describe.configure({ mode: 'serial' });

test.describe('support sessions', () => {
  let agencyId = '';
  let clientId = '';

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    for (const who of ['staff', 'viewer', 'target'] as const) await ensureState(browser, testInfo, who);
    ({ agencyId, clientId } = await targetIds());
  });

  test('staff starts a session and the portfolio renders read-only', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'staff', async (page) => {
      await startSession(page, agencyId, 'Investigating a report that the weekly brief is late');
      await expect(page.getByRole('heading', { name: 'Portfolio', exact: false }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Target Plumbing' }).first()).toBeVisible();
      await expect(banner(page)).toContainText('Support Target Agency');
      await expect(banner(page)).toContainText('Investigating a report that the weekly brief is late');
      await expect(banner(page).getByRole('button', { name: 'Exit' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Add client' })).toHaveCount(0);
      await page.goto('/agency/team');
      await expect(banner(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /invite/i })).toHaveCount(0);
    });
  });

  test('the same session opens a client workspace page, still read-only', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'staff', async (page) => {
      await startSession(page, agencyId, 'Checking the client overview renders');
      const res = await page.goto(`/c/${clientId}`);
      expect(res?.status()).toBe(200);
      await expect(banner(page)).toContainText('Checking the client overview renders');
      await expect(page.getByRole('heading', { name: 'Target Plumbing' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Add client' })).toHaveCount(0);
      const profile = await page.goto(`/c/${clientId}/settings/profile`);
      expect(profile?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Profile — Target Plumbing' })).toBeVisible();
      await expect(banner(page)).toBeVisible();
      await page.goto(`/c/${clientId}/competitors`);
      await expect(banner(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /add competitor/i })).toHaveCount(0);
    });
  });

  test('a forced write is refused with the read-only copy', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    // Capture a real server-action request (the "Email me when support opens a session" switch) as the agency's own admin...
    const captured = await as(browser, testInfo, 'target', async (page) => {
      await page.goto('/agency/settings/platform-access');
      const switchEl = page.getByRole('switch', { name: 'Email me when Rival Monday support opens a session' });
      await expect(switchEl).toBeVisible();
      const reqPromise = page.waitForRequest((r) => r.method() === 'POST' && r.headers()['next-action'] !== undefined);
      await switchEl.click();
      const req = await reqPromise;
      await req.response(); // the toggle has landed before the restore below
      const h = req.headers();
      return { actionId: h['next-action']!, contentType: h['content-type'] ?? 'text/plain;charset=UTF-8', body: req.postData() ?? '[true]', path: new URL(req.url()).pathname };
    });
    // M7(a): the capture really turned the notify switch on; restore the default (off) so later sessions in this run
    // send no access emails. The replay below is refused, so it cannot turn it back on.
    await withDb((db) => db.execute(sql`update agency set notify_support_access = false where name = 'Support Target Agency'`));
    // ...and replay it from the staff member's support session: the registry must refuse it.
    await as(browser, testInfo, 'staff', async (page) => {
      await startSession(page, agencyId, 'Replaying a write to prove the server refuses it');
      const res = await page.request.post(captured.path, {
        headers: { 'next-action': captured.actionId, 'content-type': captured.contentType, accept: 'text/x-component' },
        data: captured.body,
      });
      expect(await res.text()).toContain(REFUSAL);
    });
  });

  test('Exit returns to the console with the ended notice', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'staff', async (page) => {
      await startSession(page, agencyId, 'Quick look, then exit');
      await banner(page).getByRole('button', { name: 'Exit' }).click();
      await expect(page).toHaveURL(new RegExp(`/platform/agencies/${agencyId}\\?ended=1$`));
      await expect(page.getByText('Support session ended.', { exact: true })).toBeVisible();
      await expect(banner(page)).toHaveCount(0);
      await page.goto('/agency');
      await expect(banner(page)).toHaveCount(0);
    });
  });

  test('the target agency admin sees the session under Platform access', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    const reason = 'Visible to the agency admin: audit of sync settings';
    await as(browser, testInfo, 'staff', async (page) => {
      await startSession(page, agencyId, reason);
      await banner(page).getByRole('button', { name: 'Exit' }).click();
      await expect(page).toHaveURL(/ended=1$/);
    });
    await as(browser, testInfo, 'target', async (page) => {
      await page.goto('/agency/settings/platform-access');
      await expect(page.getByRole('heading', { name: 'Platform access', exact: true })).toBeVisible();
      await expect(page.getByText(reason).first()).toBeVisible();
    });
  });

  test('a viewer-role operator gets no "View as agency"', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    await as(browser, testInfo, 'viewer', async (page) => {
      const res = await page.goto(`/platform/agencies/${agencyId}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Support Target Agency', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'View as agency' })).toHaveCount(0);
    });
  });

  test('a tampered rm_support cookie is ignored and cleared', { tag: ['@support'] }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: STATE('staff') });
    try {
      const page = await context.newPage();
      await context.addCookies([{ name: 'rm_support', value: `${agencyId}.badmacbadmacbadmac`, url: testInfo.project.use.baseURL! }]);
      const res = await page.goto('/agency');
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(/\/agency$/);
      await expect(banner(page)).toHaveCount(0);
      // Normal viewer: the operator's own house agency, not the target.
      await expect(page.getByText('Target Plumbing')).toHaveCount(0);
      expect((await context.cookies()).some((c) => c.name === 'rm_support')).toBe(false);
    } finally {
      await context.close();
    }
  });

  test('at 390px the banner shows the reason and Exit without horizontal page scroll', { tag: ['@support', '@responsive'] }, async ({ browser }, testInfo) => {
    await as(
      browser,
      testInfo,
      'staff',
      async (page) => {
        await startSession(page, agencyId, 'Phone-width check of the banner');
        await expect(banner(page)).toContainText('Phone-width check of the banner');
        await expect(banner(page).getByRole('button', { name: 'Exit' })).toBeVisible();
        const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, banner: (document.querySelector('[aria-label="Support session"]') as HTMLElement).scrollWidth - (document.querySelector('[aria-label="Support session"]') as HTMLElement).clientWidth }));
        expect(overflow.banner).toBeLessThanOrEqual(0);
        expect(overflow.page).toBeLessThanOrEqual(0);
      },
      { width: 390, height: 844 },
    );
  });
});

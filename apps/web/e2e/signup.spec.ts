import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb, pendingSignup } from '@cs/db';
import { type Browser, expect, type Page, test, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import { OUTBOX } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { newMagicLink, openMagicLink, outboxSnapshot } from './helpers';

/**
 * Phase 10 agency self-serve sign-up, against the fake Turnstile verifier (no site key in E2E) and the fake billing
 * gateway. Every test uses its own email domain (a completed open sign-up blocks a second trial for the whole company
 * domain). Sign-up links are requested server-side (not through the sign-in form's limited endpoint); opening them hits
 * the shared verify limit, which `openMagicLink` waits out. The sign-up's own limit (5 per IP per hour) is above the
 * three sign-ups this file makes.
 */
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
const domain = (tag: string) => `signup-${RUN}-${tag}.test`;
const CHECK_EMAIL = /\/sign-in\/check-email\?for=signup$/;
const CHECK_EMAIL_COPY = "Check your inbox. If you can create an agency with this address, we've sent a link to confirm it. The link works for 15 minutes.";

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

/** Fills the sign-up form already open in `page` and submits it; lands on the sign-up check-email page either way. */
async function submitSignUp(page: Page, email: string, agencyName: string): Promise<void> {
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Agency name').fill(agencyName);
  await page.getByRole('button', { name: 'Create my agency' }).click();
  await expect(page).toHaveURL(CHECK_EMAIL);
  await expect(page.getByText(CHECK_EMAIL_COPY)).toBeVisible();
}

/** Signs up from `path` (`/sign-up` or `/join/<token>`), confirms the email by its magic link and lands in the wizard. */
async function signUpAndConfirm(page: Page, email: string, agencyName: string, path = '/sign-up'): Promise<void> {
  await page.goto(path);
  const before = await outboxSnapshot();
  await submitSignUp(page, email, agencyName);
  await openMagicLink(page, await newMagicLink(before, email));
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function fresh<T>(browser: Browser, testInfo: TestInfo, fn: (page: Page) => Promise<T>, storageState: string | { cookies: []; origins: [] } = { cookies: [], origins: [] }): Promise<T> {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Step 1 of the agency wizard: name and email are pre-filled from sign-up; the contact and phone are typed. */
async function fillAbout(page: Page, contact = 'Sam Lee'): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Welcome to Rival Monday', level: 1 })).toBeVisible();
  await expect(page.getByLabel(/^Agency name/)).not.toHaveValue('');
  await expect(page.getByLabel(/^Email address/)).not.toHaveValue('');
  await page.getByLabel(/^Contact full name/).fill(contact);
  await page.getByLabel(/^Phone/).fill('(512) 555-0142');
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Skips the team and brand steps; ends on the confirmation screen. */
async function skipToDone(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Invite your team', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'Put your brand on it', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: /^You're all set/, level: 1 })).toBeVisible();
}

test('an open sign-up confirms by email, fills step 1, skips team and brand, and "Add your first client" lands on the new-client page', { tag: ['@auth', '@onboarding', '@clients'] }, async ({ browser }, testInfo) => {
  await fresh(browser, testInfo, async (page) => {
    await signUpAndConfirm(page, `owner@${domain('open')}`, 'Open Sign-up Agency');
    await fillAbout(page);
    await skipToDone(page);
    await page.getByRole('button', { name: 'Add your first client' }).click();
    await expect(page).toHaveURL(/\/agency\/clients\/new$/);
  });
});

test('"Go to dashboard" leaves the skipped steps on the getting-started card until it is dismissed', { tag: ['@auth', '@onboarding', '@clients'] }, async ({ browser }, testInfo) => {
  await fresh(browser, testInfo, async (page) => {
    await signUpAndConfirm(page, `owner@${domain('dash')}`, 'Dashboard Sign-up Agency');
    await fillAbout(page);
    await skipToDone(page);
    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/agency$/);
    // A later full load (the next visit) still shows the portfolio with the card: no redirect back into the wizard.
    await page.reload();
    await expect(page).toHaveURL(/\/agency$/);
    await expect(page.getByText('Getting started')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add your first client' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a payment method' })).toBeVisible();
    await expect(page.getByText('skipped', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText('Getting started')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
    await expect(page.getByText('Getting started')).toHaveCount(0);
  });
});

test('a pilot invite link shows its offer, and the new agency is on the pilot', { tag: ['@auth', '@onboarding', '@billing', '@platform'] }, async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
  const pilotEnd = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const url = await fresh(browser, testInfo, async (page) => {
    await page.goto('/platform/billing?tab=signups');
    await page.getByLabel('Offer').selectOption('pilot');
    await page.getByLabel('Pilot ends').fill(pilotEnd);
    await page.getByLabel('Note (optional)').fill(`e2e pilot ${RUN}`);
    await page.getByRole('button', { name: 'Create link' }).click();
    const box = page.getByLabel('New invite link');
    await expect(box).toBeVisible();
    return box.inputValue();
  }, ADMIN_STATE);
  const path = new URL(url).pathname;
  expect(path).toMatch(/^\/join\/rm_inv_/);

  await fresh(browser, testInfo, async (page) => {
    await page.goto(path);
    await expect(page.getByText(/^You're invited to the Rival Monday pilot until /)).toBeVisible();
    await signUpAndConfirm(page, `owner@${domain('pilot')}`, 'Pilot Invite Agency', path);
    // Phase 16: step 1 is required, and an unfinished wizard catches the first /agency visit; finish it first.
    await fillAbout(page);
    await skipToDone(page);
    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/agency$/);
    await page.goto('/agency/settings/billing');
    await expect(page.getByText('Pilot', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Pilot ends /)).toBeVisible();
  });
});

test('a pilot link ending before it expires is refused', { tag: ['@billing', '@platform'] }, async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
  const today = new Date().toISOString().slice(0, 10);
  await fresh(browser, testInfo, async (page) => {
    await page.goto('/platform/billing?tab=signups');
    await page.getByLabel('Offer').selectOption('pilot');
    await page.getByLabel('Pilot ends').fill(today);
    await page.getByLabel('Note (optional)').fill(`e2e pilot refused ${RUN}`);
    await page.getByRole('button', { name: 'Create link' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'after this link expires' })).toBeVisible();
    await expect(page.getByLabel('New invite link')).toHaveCount(0);
  }, ADMIN_STATE);
});

test('a second trial for a company domain gets the same check-email page and no link', { tag: ['@auth'] }, async ({ browser }, testInfo) => {
  const dom = domain('dup');
  // The domain already completed an open sign-up (seeded directly: the refusal is the subject here, not the first trial).
  await withDb((db) => db.insert(pendingSignup).values({
    email: `first@${dom}`, agencyName: 'First Trial Agency', source: 'open', ipHash: 'e'.repeat(64),
    expiresAt: new Date(Date.now() + 86_400_000), completedAt: new Date(),
  }));
  const second = `second@${dom}`;
  await fresh(browser, testInfo, async (page) => {
    await page.goto('/sign-up');
    const before = await outboxSnapshot();
    await submitSignUp(page, second, 'Second Trial Agency');
    // Accepted sign-ups send in the background; give a link the time it would need to land, then check none did.
    await page.waitForTimeout(3_000);
    const added = (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) => f.endsWith('.json') && !before.has(f));
    const to = await Promise.all(added.map(async (f) => (await readFile(join(OUTBOX, f), 'utf8')).toLowerCase()));
    expect(to.filter((body) => body.includes(second)), 'no email to the refused address').toEqual([]);
  });
});

test('uploading a logo in the brand step shows it in the live preview', { tag: ['@onboarding'] }, async ({ browser }, testInfo) => {
  await fresh(browser, testInfo, async (page) => {
    await signUpAndConfirm(page, `owner@${domain('logo')}`, 'Logo Upload Agency');
    await fillAbout(page); // Phase 16: step 1 is required before any other step opens
    await expect(page.getByRole('heading', { name: 'Invite your team', level: 1 })).toBeVisible();
    await page.goto('/onboarding?step=branding');
    await expect(page.getByRole('heading', { name: 'Put your brand on it', level: 1 })).toBeVisible();
    const upload = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/agency/settings/branding/logo'));
    const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#2A6BAC' } }).png().toBuffer();
    await page.getByLabel(/^Agency logo/).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
    expect((await upload).status()).toBe(200);
    const img = page.getByTestId('preview-dashboard-header').locator('img');
    await expect(img).toHaveAttribute('src', /\/files\/logo\/[0-9a-f-]+\/[0-9a-f]{64}\.png$/);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  });
});

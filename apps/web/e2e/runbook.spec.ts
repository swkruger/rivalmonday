import { brief, briefItem, catalogRows, client, clientCompetitor, createDb } from '@cs/db';
import { generateBrief } from '@cs/engine';
import { createCatalog } from '@cs/verticals';
import { type Browser, expect, test } from '@playwright/test';
import { eq, sql } from 'drizzle-orm';
import { createFakeAi, noul } from '../../../packages/engine/test/fake-ai';
import { day, seedScoredEvent } from '../../../packages/engine/test/seed';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { agencyOriginOf, ensureClientHostState, hostsFixture } from './helpers';
import { ASK_USER_EMAIL, RB_CLIENT, RB_TAILORED_KEY } from './seed';

/**
 * Phase 14b acceptance path. A seeded Distillery-type client (a catalogue type with no plays of its own, so it follows
 * the agency runbook) has a tailored client runbook: the tailoring job itself never runs in E2E. The steps share state
 * (the client's customised play feeds the brief), so they run in order.
 */
const PLAY = 'play:price_cut_bundle';
const CUSTOM_PREFIX = 'Distillery tasting bundle';
const CUSTOM = `${CUSTOM_PREFIX}: pair {{service}} with a cellar tour instead of matching {{competitor}}.`;
const AGENCY_CUSTOM = 'Agency-wide: hold your price and add a tasting-room credit.';

async function clientId(): Promise<string> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [c] = await db.select({ id: client.id }).from(client).where(eq(client.name, RB_CLIENT));
    return c!.id;
  } finally {
    await close();
  }
}

/** The Ask client owner's session on E2E Agency's host (shared with the other specs that sign this user in there). */
async function ensureAskerState(browser: Browser): Promise<string> {
  return ensureClientHostState(browser, ASK_USER_EMAIL, hostsFixture().slug, `/c/${await clientId()}`);
}

test.describe.serial('runbooks', () => {
  let askerState = '';
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    askerState = await ensureAskerState(browser);
  });

  test.describe('as the agency admin', () => {
    test.use({ storageState: ADMIN_STATE });

    test('a client runbook shows the tailored play and a customised edit is marked', { tag: ['@runbook', '@clients'] }, async ({ page }) => {
      await page.goto(`/c/${await clientId()}/settings/runbook`);
      await expect(page.getByRole('heading', { level: 1, name: 'Runbook' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(RB_CLIENT)).toBeVisible();
      const tailored = page.locator(`[data-item="${RB_TAILORED_KEY}"]`);
      await expect(tailored.getByText('Customised')).toBeVisible();
      await expect(tailored.getByText(/Tailored for a distillery/).first()).toBeVisible();

      const card = page.locator(`[data-item="${PLAY}"]`);
      await expect(card.getByText('Inherited')).toBeVisible();
      await card.getByRole('button', { name: 'Edit' }).click();
      await card.getByLabel('Template').fill(CUSTOM);
      await card.getByRole('button', { name: 'Save' }).click();
      await expect(card.getByText('Customised')).toBeVisible();
      await expect(card.getByText(CUSTOM_PREFIX).first()).toBeVisible();
    });

    test('an agency edit of the same play shows "Update available" on the client until the admin keeps theirs', { tag: ['@runbook', '@clients'] }, async ({ page }) => {
      await page.goto('/agency/settings/runbook');
      const agencyCard = page.locator(`[data-item="${PLAY}"]`);
      await agencyCard.getByRole('button', { name: 'Edit' }).click();
      await agencyCard.getByLabel('Template').fill(AGENCY_CUSTOM);
      await agencyCard.getByRole('button', { name: 'Save' }).click();
      // The editor closes only once the save has landed; the text alone can match the editor before it commits.
      await expect(agencyCard.getByRole('button', { name: 'Save' })).toBeHidden();
      await expect(agencyCard.getByText(AGENCY_CUSTOM).first()).toBeVisible();

      await page.goto(`/c/${await clientId()}/settings/runbook`);
      const card = page.locator(`[data-item="${PLAY}"]`);
      await expect(card.getByText('Update available').first()).toBeVisible();
      await card.getByRole('button', { name: 'Review update' }).click();
      await card.getByRole('button', { name: 'Keep mine' }).click();
      await expect(card.getByText('Update available')).toBeHidden();
      await expect(card.getByText('Customised')).toBeVisible();
      await expect(card.getByText(CUSTOM_PREFIX).first()).toBeVisible();
    });

    test('the old playbooks addresses redirect to the agency runbook', { tag: ['@runbook'] }, async ({ page }) => {
      await page.goto('/agency/playbooks');
      await expect(page).toHaveURL(/\/agency\/settings\/runbook$/);
      await page.goto('/agency/settings/playbooks');
      await expect(page).toHaveURL(/\/agency\/settings\/runbook$/);
    });
  });

  test.describe('as the client owner', () => {
    test('the client runbook page is a 404', { tag: ['@runbook', '@clients'] }, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: agencyOriginOf(), storageState: askerState });
      try {
        const page = await context.newPage();
        const response = await page.goto(`/c/${await clientId()}/settings/runbook`);
        expect(response?.status()).toBe(404);
      } finally {
        await context.close();
      }
    });
  });

  test('a generated brief uses the client’s customised play text', { tag: ['@runbook', '@briefs'] }, async () => {
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      const id = await clientId();
      const [c] = await db.select({ agencyId: client.agencyId }).from(client).where(eq(client.id, id));
      const [link] = await db.select({ competitorId: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.clientId, id));
      await seedScoredEvent(db, { competitorId: link!.competitorId, clientId: id, agencyId: c!.agencyId, occurredAt: day(14), createdAt: day(14), services: { e2e_distillery: 'tasting_room' } });

      const draft = JSON.stringify({
        summary: 'Rival Spirits Distillers cut a price.',
        items: [{ ref: 'C1', headline: 'Rival Spirits Distillers cut its AC tune-up to $69.', what_changed: 'The pricing page shows $69, down from $89.', why_it_matters: 'Price shoppers may compare.', recommended_action: 'Bundle a tasting.', effort: 'L', impact: 'M', upsell_tag: 'ppc' }],
      });
      const ai = createFakeAi({
        chat: () => draft,
        decide: (_s, qs) => ({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, noul(true)])), needsReview: [] }),
      });
      const catalog = createCatalog(() => catalogRows(db), { ttlMs: 0 });
      const result = await generateBrief({ db, ai, packs: catalog.packs, generic: () => catalog.generic() }, id, { now: new Date('2026-10-16T03:30:00Z') });
      expect(result).toMatchObject({ status: 'ready', kind: 'standard', items: 1 });

      // The writer was handed the client's own wording, not the agency's.
      const prompt = ai.calls.chat[0]!.content;
      expect(prompt).toContain(CUSTOM_PREFIX);
      expect(prompt).not.toContain(AGENCY_CUSTOM);
      const [item] = await db.select({ playbookId: briefItem.playbookId, playbookVersion: briefItem.playbookVersion }).from(briefItem).where(eq(briefItem.clientId, id));
      expect(item).toMatchObject({ playbookId: 'price_cut_bundle' });
      expect(item!.playbookVersion).toBeGreaterThan(1);
    } finally {
      // The brief must not appear in the shared lists other specs read (approvals, past briefs).
      const id = await clientId();
      await db.delete(briefItem).where(eq(briefItem.clientId, id));
      await db.delete(brief).where(eq(brief.clientId, id));
      await close();
    }
  });
});

/**
 * 13a2 R3: the Voice section of the agency runbook and of a client runbook. The preview answers from the E2E fixture (no paid
 * call). Runs after the runbook tests above, so the agency voice it saves reaches no brief a test generates.
 */
test.describe.serial('voice', () => {
  test.use({ storageState: ADMIN_STATE });
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
  });

  // Leave no voice behind for later specs that generate briefs or alerts: drop the agency's `knob:voice` item (back to the default).
  test.afterAll(async () => {
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    try {
      const [{ id: agencyId }] = (await db.select({ id: client.agencyId }).from(client).where(eq(client.name, RB_CLIENT))) as [{ id: string }];
      await db.execute(sql`delete from runbook_item where item_key = 'knob:voice' and runbook_id in (select id from runbook where agency_id = ${agencyId} and client_id is null)`);
    } finally {
      await close();
    }
  });

  const voice = (page: import('@playwright/test').Page) => page.locator('[data-item="knob:voice"]');

  test('agency admin saves a voice and previews it', { tag: ['@runbook'] }, async ({ page }) => {
    await page.goto('/agency/settings/runbook');
    const section = voice(page);
    await section.getByRole('radio', { name: /Formal/ }).check();
    await section.getByRole('button', { name: 'Add a pair' }).click();
    await section.getByLabel('Say').fill('tune-up visit');
    await section.getByLabel('Instead of').fill('service call');
    await section.getByLabel('Banned words').fill('cheap');
    await section.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(section.getByRole('button', { name: 'Remove cheap' })).toBeVisible();

    // The preview shows the unsaved form in the result region (always mounted).
    await section.getByRole('button', { name: 'Preview' }).click();
    const result = section.getByTestId('voice-result');
    await expect(result.getByRole('heading', { name: 'Sample alert' })).toBeVisible();
    await expect(result).toContainText('formal voice');
    await expect(result).toContainText('"tune-up visit"');

    await section.getByRole('button', { name: 'Save voice' }).click();
    await expect(result).toContainText('Saved. New briefs and alerts use this voice.');

    // It is stored: a reload shows the same voice.
    await page.reload();
    await expect(voice(page).getByRole('radio', { name: /Formal/ })).toBeChecked();
    await expect(voice(page).getByLabel('Say')).toHaveValue('tune-up visit');
    await expect(voice(page).getByRole('button', { name: 'Remove cheap' })).toBeVisible();
  });

  test('client override saves and returns to the agency voice', { tag: ['@runbook', '@clients'] }, async ({ page }) => {
    await page.goto(`/c/${await clientId()}/settings/runbook`);
    const section = voice(page);
    await expect(section.getByText('Uses the agency voice.')).toBeVisible();
    await expect(section.getByText('Tone: Formal.')).toBeVisible();

    await section.getByRole('button', { name: 'Set a voice for this client' }).click();
    await section.getByRole('radio', { name: /Direct/ }).check();
    await section.getByRole('button', { name: 'Save voice' }).click();
    await expect(section.getByTestId('voice-result')).toContainText('Saved. New briefs and alerts use this voice.');
    await page.reload();
    await expect(voice(page).getByText('Own voice')).toBeVisible();
    await expect(voice(page).getByRole('radio', { name: /Direct/ })).toBeChecked();

    await voice(page).getByRole('button', { name: 'Use the agency voice' }).click();
    await expect(voice(page).getByText('Uses the agency voice.')).toBeVisible();
    await expect(voice(page).getByText('Tone: Formal.')).toBeVisible();
    await expect(voice(page).getByText('Own voice')).toHaveCount(0);
  });
});

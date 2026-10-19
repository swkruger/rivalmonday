import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brief, briefItem, catalogRows, client, clientCompetitor, createDb } from '@cs/db';
import { generateBrief } from '@cs/engine';
import { createCatalog } from '@cs/verticals';
import { type Browser, expect, test, type TestInfo } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createFakeAi, noul } from '../../../packages/engine/test/fake-ai';
import { day, seedScoredEvent } from '../../../packages/engine/test/seed';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import { signIn } from './helpers';
import { ASK_USER_EMAIL, RB_CLIENT, RB_TAILORED_KEY } from './seed';

/**
 * Phase 14b acceptance path. A seeded Distillery-type client (a catalogue type with no plays of its own, so it follows
 * the agency runbook) has a tailored client runbook: the tailoring job itself never runs in E2E. The steps share state
 * (the client's customised play feeds the brief), so they run in order.
 */
const ASKER_STATE = fileURLToPath(new URL('../test-results/asker-state.json', import.meta.url));
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

async function ensureAskerState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(ASKER_STATE)) return;
  const id = await clientId();
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, ASK_USER_EMAIL, `/c/${id}`);
  await expect(page).toHaveURL(new RegExp(`/c/${id}$`));
  await context.storageState({ path: ASKER_STATE });
  await context.close();
}

test.describe.serial('runbooks', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await ensureAskerState(browser, testInfo);
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
    test.use({ storageState: ASKER_STATE });

    test('the client runbook page is a 404', { tag: ['@runbook', '@clients'] }, async ({ page }) => {
      const response = await page.goto(`/c/${await clientId()}/settings/runbook`);
      expect(response?.status()).toBe(404);
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

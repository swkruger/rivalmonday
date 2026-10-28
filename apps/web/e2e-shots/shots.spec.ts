import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { createDb } from '@cs/db';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { OWNER_LINK_FILE, SETUP_FIXTURE_FILE } from '../playwright.config';
import { signIn } from '../e2e/helpers';
import { shotsLabel, writeIndexPage } from '../scripts/shots-index';
import { SHOT_ROUTES, SHOT_VIEWPORTS, type ShotAs, type ShotFixtures } from './routes';

/**
 * Phase 16 screenshot + axe harness. For each route x viewport: a full-page PNG to
 * `apps/web/.shots/<SHOTS_LABEL>/<label>-<w>.png` and an axe (wcag2a/aa) entry in the same folder's `axe.json`.
 * `.shots/` sits outside `test-results/`, which the main E2E run deletes at start. `SHOTS_LABEL` is validated by `shotsLabel`.
 * Axe never fails a route unless it has `gate: true`.
 */
const LABEL = shotsLabel(process.env.SHOTS_LABEL);
const ROOT = fileURLToPath(new URL('../.shots', import.meta.url));
const DIR = join(ROOT, LABEL);
const AXE_FILE = join(DIR, 'axe.json');

type AxeRow = { label: string; width: number; overflowX: number; serious: number; critical: number; ids: string[]; nodes: { id: string; targets: string[] }[] };
type Db = ReturnType<typeof createDb>['db'];

test.describe.configure({ mode: 'serial' });

const gateFailures: string[] = [];
let fx: ShotFixtures;
const contexts: Partial<Record<ShotAs, BrowserContext>> = {};

async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

async function firstId(db: Db, query: ReturnType<typeof sql>): Promise<string> {
  const rows = [...(await db.execute<{ id: string }>(query))];
  if (!rows[0]) throw new Error('shots: seed row not found');
  return rows[0].id;
}

async function maybeId(db: Db, query: ReturnType<typeof sql>): Promise<string | null> {
  const rows = [...(await db.execute<{ id: string }>(query))];
  return rows[0]?.id ?? null;
}

/**
 * The E2E seed has no delivered alert and no trend report (and must not change: it shifts E2E expectations), so the
 * harness adds one of each for the shots client. Idempotent: guarded by a fixed headline / quarter marker.
 */
async function seedShotRows(db: Db): Promise<void> {
  const clientId = await firstId(db, sql`select id from client where name = 'E2E HVAC'`);
  const agencyId = await firstId(db, sql`select agency_id as id from client where id = ${clientId}`);
  const competitorId = await firstId(db, sql`select id from competitor where name = 'Smith HVAC'`);
  const eventId = await firstId(db, sql`select ce.id from event ce join event_score es on es.event_id = ce.id where es.client_id = ${clientId} and ce.retracted_at is null order by ce.occurred_at desc limit 1`);
  const briefId = await firstId(db, sql`select id from brief where client_id = ${clientId} and status = 'sent' order by delivery_date limit 1`);
  const evidenceId = await firstId(db, sql`select evidence_ids ->> 0 as id from brief_item where brief_id = ${briefId} and jsonb_array_length(evidence_ids) > 0 limit 1`);
  const headline = 'Shots: Smith HVAC delivered promo alert';
  await db.execute(sql`
    insert into alert (agency_id, client_id, competitor_id, event_id, score, headline, body, written, evidence_ids, status, mode, delivery, delivered_at)
    select ${agencyId}, ${clientId}, ${competitorId}, ${eventId}, 81, ${headline}, 'Smith HVAC launched a $49 drain-cleaning promo.', 'template', ${JSON.stringify([evidenceId])}::jsonb, 'delivered', 'direct', 'immediate', now()
    where not exists (select 1 from alert where client_id = ${clientId} and headline = ${headline})`);
  const data = {
    quarter: '2026-Q3',
    windowDays: 90,
    businesses: [{ competitorId, name: 'Smith HVAC', self: false, reviews: 42, avgRating: 4.6, prevAvgRating: 4.5, activeAds: 2 }],
    eventsByType: { promo: 2, price_change: 1 },
    moves: [{ moveType: 'promo', competitorName: 'Smith HVAC', status: 'detected', firstDetectedAt: '2026-08-01T00:00:00.000Z' }],
    briefsSent: 12,
    alertsDelivered: 3,
    recommendations: { created: 5, done: 2, inProgress: 1, dismissed: 1 },
  };
  await db.execute(sql`
    insert into trend_report (agency_id, client_id, quarter, period_start, period_end, data, status, sent_at)
    values (${agencyId}, ${clientId}, '2026-Q3', '2026-07-01T00:00:00Z', '2026-09-30T23:59:59Z', ${JSON.stringify(data)}::jsonb, 'sent', now())
    on conflict (client_id, quarter) do nothing`);
}

async function fixtures(): Promise<ShotFixtures> {
  const setup = JSON.parse(readFileSync(SETUP_FIXTURE_FILE, 'utf8')) as { finish: { id: string }; owner: { id: string } };
  return withDb(async (db) => {
    const clientId = await firstId(db, sql`select id from client where name = 'E2E HVAC'`);
    const briefId = await firstId(db, sql`select id from brief where client_id = ${clientId} and status = 'sent' order by delivery_date limit 1`);
    return {
      clientId,
      briefId,
      competitorId: await firstId(db, sql`select id from competitor where name = 'Smith HVAC'`),
      evidenceId: await firstId(db, sql`select evidence_ids ->> 0 as id from brief_item where brief_id = ${briefId} and jsonb_array_length(evidence_ids) > 0 limit 1`),
      agencyId: await firstId(db, sql`select agency_id as id from client where id = ${clientId}`),
      setupClientId: setup.finish.id,
      setupOwnerClientId: setup.owner.id,
      askClientId: await firstId(db, sql`select id from client where name = 'Ask Demo Heating'`),
      eventId: await firstId(db, sql`select ce.id from event ce join event_score es on es.event_id = ce.id where es.client_id = ${clientId} and ce.retracted_at is null order by ce.occurred_at desc limit 1`),
      prospectClientId: await firstId(db, sql`select id from client where name = 'E2E Prospect Dental'`),
      alertId: await firstId(db, sql`select id from alert where client_id = ${clientId} and status = 'delivered' order by created_at desc limit 1`),
      approvalBriefId: await maybeId(db, sql`select id from brief where agency_id = (select agency_id from client where id = ${clientId}) and status = 'ready' order by created_at desc limit 1`),
      reportId: await maybeId(db, sql`select id from trend_report where client_id = ${clientId} limit 1`),
    };
  });
}

const blank = (browser: Browser, baseURL: string) => browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

async function signedInContext(browser: Browser, baseURL: string, email: string): Promise<BrowserContext> {
  const context = await blank(browser, baseURL);
  const page = await context.newPage();
  await signIn(page, email);
  await page.waitForLoadState('load');
  await page.close();
  return context;
}

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000);
  const baseURL = testInfo.project.use.baseURL!;
  // Each run owns its label folder: start clean so stale PNGs from removed routes don't linger.
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(AXE_FILE, '[]');
  await withDb(seedShotRows);
  fx = await fixtures();

  const admin = await signedInContext(browser, baseURL, 'admin@e2e.test');
  contexts.admin = admin;
  contexts.agency = admin;

  const owner = await blank(browser, baseURL);
  const ownerPage = await owner.newPage();
  await ownerPage.goto(readFileSync(OWNER_LINK_FILE, 'utf8').trim());
  await ownerPage.close();
  contexts.owner = owner;

  contexts['signed-out'] = await blank(browser, baseURL);

  // Support: staff is a platform operator (row written once the first sign-in has created the auth user), then a read-only session.
  const staff = await signedInContext(browser, baseURL, 'staff@e2e.test');
  await withDb((db) =>
    db.execute(sql`insert into platform_admin (user_id, role, created_by) select id, 'staff', 'e2e-shots' from auth."user" where email = 'staff@e2e.test' on conflict do nothing`),
  );
  const targetId = await withDb((db) => firstId(db, sql`select id from agency where name = 'Support Target Agency'`));
  const sp = await staff.newPage();
  await sp.goto(`/platform/agencies/${targetId}`);
  await sp.getByRole('button', { name: 'View as agency' }).click();
  await sp.getByLabel('Why are you opening this agency? (shown to the agency)').fill('Screenshot baseline');
  await sp.getByRole('button', { name: 'Start read-only session' }).click();
  await expect(sp).toHaveURL(/\/agency$/);
  await sp.close();
  contexts.support = staff;
});

test.afterAll(async () => {
  for (const ctx of new Set(Object.values(contexts))) await ctx?.close();
  writeIndexPage(ROOT);
});

for (const route of SHOT_ROUTES) {
  for (const viewport of SHOT_VIEWPORTS) {
    test(`${route.label} @ ${viewport.width}`, async () => {
      test.skip(route.skipIf?.(fx) === true, `fixture missing for ${route.label}`);
      const page: Page = await contexts[route.as]!.newPage();
      try {
        await page.setViewportSize(viewport);
        const path = typeof route.path === 'function' ? route.path(fx) : route.path;
        await page.goto(path);
        if (route.heading) await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
        await page.screenshot({ path: join(DIR, `${route.label}-${viewport.width}.png`), fullPage: true });
        // WCAG 1.4.3 exempts logotype text: the wordmark's amber "monday" half is the decided brand colour (1.93:1 on canvas).
        const results = await new AxeBuilder({ page }).exclude('[data-part="monday"]').withTags(['wcag2a', 'wcag2aa']).analyze();
        const count = (impact: string) => results.violations.filter((v) => v.impact === impact).length;
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const row: AxeRow = { label: route.label, width: viewport.width, overflowX, serious: count('serious'), critical: count('critical'), ids: results.violations.map((v) => v.id), nodes: results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, targets: v.nodes.slice(0, 10).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? '')) })) };
        const rows = existsSync(AXE_FILE) ? (JSON.parse(readFileSync(AXE_FILE, 'utf8')) as AxeRow[]) : [];
        writeFileSync(AXE_FILE, JSON.stringify([...rows, row], null, 2));
        if (route.gate && row.serious + row.critical > 0) gateFailures.push(`${route.label} @ ${viewport.width}: ${JSON.stringify(row.nodes)}`);
        if (route.gate && viewport.width === 390 && overflowX > 1) gateFailures.push(`${route.label} @ 390: overflow ${overflowX}px`);
      } finally {
        await page.close();
      }
    });
  }
}

test('axe gate: no serious/critical on gated routes', () => {
  expect(gateFailures).toEqual([]);
});

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { currentStandardPlan, ensureExemptPilot } from '@cs/billing';
import { signLink } from '@cs/core/server';
import { ad, agency, agencyBilling, alert, askMessage, askStarter, askThread, brief, briefItem, businessArea, catalogRows, capture, changeEvent, client, clientCompetitor, clientSetup, competitor, competitorSignal, competitorSuggestion, contact, createDb, discoveryRun, detectedChange, intakeLink, lead, eventChange, eventScore, evidence, llmCall, move, moveEvent, pricePoint, prospectReport, rankMapImage, rankScan, rankSnapshot, recommendation, review, reviewAnalysis, topicProposal, trackedPage, vertical } from '@cs/db';
import { copyItems, createClientRunbookIfAbsent, ensureAgencyRunbook, readRunbookItems } from '@cs/engine';
import { createStoreFromEnv } from '@cs/storage';
import { createCatalog } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
import { acceptInvitations, createInvitation, seedKnowledge } from '@cs/tools';
import { resolveEvidenceDir } from '../src/server/files';
import { ASK_FIXTURE_FILE, E2E_LINK_SECRET, MCP_CLIENTS_FILE, OUTBOX, OWNER_LINK_FILE, RIVALS_FIXTURE_FILE, SETUP_FIXTURE_FILE, STARTING_FIXTURE_FILE } from '../playwright.config';

/**
 * Seeds `cs_test` for the E2E smoke run: one agency, one client, one competitor, a sent brief, an invitation and a
 * client contact; plus (5b-2) near-cap spend, a prospect with a ready snapshot, and a pending topic proposal; plus
 * (6a) two more active clients with AI connections on, and an invited owner of both; plus (6b) the Ask clients (`seedAsk`).
 */
export async function seed(): Promise<void> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [a] = await db.insert(agency).values({ name: 'E2E Agency', branding: { primary: '#7A3EE8' } }).returning();
    const agencyId = a!.id;
    await ensureExemptPilot(db, agencyId);

    const [c] = await db.insert(client).values({ agencyId, name: 'E2E HVAC', verticalId: 'hvac_plumbing', features: ['dashboard', 'alert_rules', 'manage_competitors'], keywords: ['ac repair'], serviceArea: { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] }, placeId: 'e2e-self-place' }).returning();
    const clientId = c!.id;

    const [comp] = await db.insert(competitor).values({ name: 'Smith HVAC', placeId: 'e2e-smith-place' }).returning();
    await db.insert(clientCompetitor).values({ agencyId, clientId, competitorId: comp!.id });

    const [b] = await db
      .insert(brief)
      .values({
        agencyId,
        clientId,
        deliveryDate: '2026-10-05',
        periodStart: new Date('2026-09-29T00:00:00Z'),
        periodEnd: new Date('2026-10-05T00:00:00Z'),
        status: 'sent',
        summary: 'Smith HVAC made one notable move this week.',
      })
      .returning();
    const briefId = b!.id;

    const [sentItem] = await db.insert(briefItem).values({
      agencyId,
      clientId,
      briefId,
      ord: 1,
      competitorId: comp!.id,
      headline: 'Smith HVAC cut AC tune-ups to $59',
      whatChanged: 'Smith HVAC dropped its AC tune-up price from $89 to $59.',
      whyItMatters: 'This undercuts the standard tune-up offer in the service area.',
      recommendedAction: 'Consider a matching or bundled promotion.',
      confidence: 0.9,
      effort: 'L',
      impact: 'H',
      upsellTag: 'ppc_audit',
    }).returning();

    const [readyBrief] = await db
      .insert(brief)
      .values({
        agencyId,
        clientId,
        deliveryDate: '2026-10-12',
        periodStart: new Date('2026-10-06T00:00:00Z'),
        periodEnd: new Date('2026-10-12T00:00:00Z'),
        status: 'ready',
        summary: 'Smith HVAC made one notable move this week.',
      })
      .returning();

    await db.insert(briefItem).values({
      agencyId,
      clientId,
      briefId: readyBrief!.id,
      ord: 1,
      competitorId: comp!.id,
      headline: 'Smith HVAC launched a $49 drain-cleaning promo',
      whatChanged: 'Smith HVAC launched a $49 drain-cleaning promo.',
      whyItMatters: 'This undercuts the standard drain-cleaning offer in the service area.',
      recommendedAction: 'Run a $49 drain-cleaning bundle',
      confidence: 0.9,
      effort: 'L',
      impact: 'H',
      upsellTag: 'ppc_audit',
    });

    const [event] = await db
      .insert(changeEvent)
      .values({ competitorId: comp!.id, changeType: 'promo', summary: 'Smith HVAC launched a $49 drain-cleaning promo.', confidence: 0.9, occurredAt: new Date() })
      .returning();

    const workspace = await seedWorkspace(db, { agencyId, clientId, competitorId: comp!.id, sentItemId: sentItem!.id });

    await db.insert(alert).values({
      agencyId,
      clientId,
      competitorId: comp!.id,
      eventId: event!.id,
      score: 81,
      headline: 'Smith HVAC started a $49 promo',
      body: 'Smith HVAC launched a $49 drain-cleaning promo.',
      status: 'pending_review',
      mode: 'after_am_check',
    });

    await createInvitation(db, { agencyId, email: 'admin@e2e.test', role: 'agency_admin', invitedBy: 'e2e-seed' });

    // Phase 8b: two platform operators (staff, viewer) who need an agency membership to reach /platform (R7; their
    // platform_admin rows are written by support.spec.ts after their first sign-in creates the auth user), and a
    // target agency with one client and its own admin for the support-session scenarios.
    await createInvitation(db, { agencyId, email: 'staff@e2e.test', role: 'account_manager', invitedBy: 'e2e-seed' });
    await createInvitation(db, { agencyId, email: 'viewer-op@e2e.test', role: 'account_manager', invitedBy: 'e2e-seed' });
    const [target] = await db.insert(agency).values({ name: 'Support Target Agency' }).returning();
    await ensureExemptPilot(db, target!.id);
    await db.insert(client).values({ agencyId: target!.id, name: 'Target Plumbing', verticalId: 'hvac_plumbing', features: ['dashboard'], keywords: ['plumber'], serviceArea: { center: { lat: 32.7, lng: -97.1 }, radiusKm: 20, zips: ['76010'] }, placeId: 'e2e-target-place' });
    await createInvitation(db, { agencyId: target!.id, email: 'target-admin@e2e.test', role: 'agency_admin', invitedBy: 'e2e-seed' });

    // Phase 9a (`billing.spec.ts`): two dedicated agencies that are not exempt pilots. A trial at its 3-client cap
    // (with an admin and an account manager) and a suspended agency (with an admin and a client owner).
    const stdPlan = (await currentStandardPlan(db))!;
    const hvac = { verticalId: 'hvac_plumbing', features: ['dashboard'], keywords: ['hvac'], serviceArea: { center: { lat: 32.7, lng: -97.1 }, radiusKm: 20, zips: ['76010'] } };
    const [trialAgency] = await db.insert(agency).values({ name: 'Trial Agency E2E' }).returning();
    await db.insert(agencyBilling).values({ agencyId: trialAgency!.id, state: 'trialing', planId: stdPlan.id, trialEndsAt: new Date(Date.now() + 20 * 86_400_000) });
    await db.insert(client).values(['Trial Heating One', 'Trial Heating Two', 'Trial Heating Three'].map((name) => ({ agencyId: trialAgency!.id, name, ...hvac })));
    await createInvitation(db, { agencyId: trialAgency!.id, email: 'trial-admin@e2e.test', role: 'agency_admin', invitedBy: 'e2e-seed' });
    await createInvitation(db, { agencyId: trialAgency!.id, email: 'trial-am@e2e.test', role: 'account_manager', invitedBy: 'e2e-seed' });
    const [pausedAgency] = await db.insert(agency).values({ name: 'Paused Agency E2E' }).returning();
    await db.insert(agencyBilling).values({ agencyId: pausedAgency!.id, state: 'suspended', planId: stdPlan.id, stateChangedAt: new Date() });
    const [pausedClient] = await db.insert(client).values({ agencyId: pausedAgency!.id, name: 'Paused Plumbing', ...hvac }).returning();
    await createInvitation(db, { agencyId: pausedAgency!.id, email: 'paused-admin@e2e.test', role: 'agency_admin', invitedBy: 'e2e-seed' });
    await createInvitation(db, { agencyId: pausedAgency!.id, email: 'paused-owner@e2e.test', role: 'client_owner', clientId: pausedClient!.id, invitedBy: 'e2e-seed' });

    // Phase 9b (`client-billing.spec.ts`): an exempt-pilot agency (eligible for client billing) that has not connected
    // Stripe, one client, its admin, and a client owner + client viewer whose auth users exist so memberships are real
    // (enabling billing emails the client owner, which needs the membership).
    const [cbAgency] = await db.insert(agency).values({ name: CB_AGENCY }).returning();
    await ensureExemptPilot(db, cbAgency!.id);
    const [cbClient] = await db.insert(client).values({ agencyId: cbAgency!.id, name: CB_CLIENT, ...hvac }).returning();
    await createInvitation(db, { agencyId: cbAgency!.id, email: CB_USERS.admin, role: 'agency_admin', invitedBy: 'e2e-seed' });
    for (const [key, role, name] of [['owner', 'client_owner', 'Olive Owner'], ['viewer', 'client_viewer', 'Vic Viewer']] as const) {
      const email = CB_USERS[key];
      await db.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${`e2e-cb-${key}`}, ${name}, ${email}, true)`);
      await createInvitation(db, { agencyId: cbAgency!.id, email, role, clientId: cbClient!.id, invitedBy: 'e2e-seed' });
      await acceptInvitations(db, { id: `e2e-cb-${key}`, email, name });
    }

    // Phase 8c: platform costs. DataForSEO is "configured" (dummy credentials in E2E_SERVER_ENV, presence only) with a
    // balance below its low threshold, so the Low strip shows; one manual monthly item gives the Spent card a figure.
    await db.execute(sql`
      insert into platform_cost_service (service, billing_url) values
        ('openrouter','https://openrouter.ai/settings/credits'), ('dataforseo','https://app.dataforseo.com/billing'),
        ('scrapecreators','https://app.scrapecreators.com'), ('apify','https://console.apify.com/billing'),
        ('anthropic','https://platform.claude.com/settings/billing'), ('neon','https://console.neon.tech/app/billing')
      on conflict do nothing`);
    await db.execute(sql`update platform_cost_service set low_threshold_usd = 10 where service = 'dataforseo'`);
    for (let d = 13; d >= 0; d--) {
      const balance = (8.2 + d * 0.25).toFixed(2);
      await db.execute(sql`
        insert into platform_cost_snapshot (service, taken_at, status, kind, amount_usd)
        values ('dataforseo', now() - make_interval(days => ${d}), 'ok', 'balance', ${balance})`);
    }
    await db.execute(sql`
      insert into platform_cost_item (name, kind, amount_usd, period, starts_on, created_by)
      values ('E2E Vercel Pro', 'recurring', 20, 'monthly', date_trunc('month', now() - interval '2 months')::date, 'e2e-seed')`);

    // 5b-2: spend near the cap (decision 6), a prospect with a ready snapshot (decisions 8–11), a pending topic proposal (decision 4).
    await db.insert(llmCall).values({ agencyId, clientId, task: 'brief_writer', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 13, latencyMs: 1, ok: true });
    const [prospect] = await db
      .insert(client)
      .values({ agencyId, name: 'E2E Prospect Dental', verticalId: 'dental', status: 'prospect', keywords: ['dentist'], serviceArea: { center: { lat: 33.95, lng: -84.33 }, radiusKm: 10, zips: [] } })
      .returning();
    const [rival] = await db.insert(competitor).values({ name: 'Bright Smiles E2E', placeId: 'ChIJe2eBrightSmile1' }).returning();
    await db.insert(clientCompetitor).values({ agencyId, clientId: prospect!.id, competitorId: rival!.id });
    await db.insert(prospectReport).values({
      agencyId, clientId: prospect!.id, status: 'ready', finishedAt: new Date(),
      data: {
        generatedAt: new Date().toISOString(), keywords: ['dentist'], points: 9, scanId: null, notes: [],
        businesses: [{ competitorId: rival!.id, name: 'Bright Smiles E2E', self: false, gbp: { rating: 4.4, reviews: 120, category: 'Dentist', extraCategories: 1 }, ads: { google: 2, meta: null }, ranks: [{ keyword: 'dentist', found: 5, top3: 2, averageRank: 3.4 }] }],
      },
    });
    await db.insert(topicProposal).values({ verticalId: 'hvac_plumbing', topicId: 'e2e_hidden_fees', name: 'E2E hidden fees', description: 'Unexpected trip fees', otherCount: 12, sampleReviewIds: [] });

    const [ownerContact] = await db.insert(contact).values({ agencyId, clientId, role: 'client_owner', email: 'owner@e2e.test' }).returning();

    // Phase 6a: a client owner of two active clients with AI connections on (the consent page's workspace picker).
    // Separate clients, so E2E HVAC keeps `mcp` off for the profile-features test.
    const mcpClients = await db.insert(client).values([
      { agencyId, name: 'First Heating Co', verticalId: 'hvac_plumbing', features: ['mcp'], keywords: ['furnace repair'] },
      { agencyId, name: 'Second Plumbing Co', verticalId: 'hvac_plumbing', features: ['mcp'], keywords: ['plumber'] },
    ]).returning({ id: client.id, name: client.name });
    for (const m of mcpClients) await createInvitation(db, { agencyId, email: 'mcp-owner@e2e.test', role: 'client_owner', clientId: m.id, invitedBy: 'e2e-seed' });
    await mkdir(dirname(MCP_CLIENTS_FILE), { recursive: true });
    await writeFile(MCP_CLIENTS_FILE, JSON.stringify({ first: mcpClients[0], second: mcpClients[1] }));

    await seedRivals(db, { agencyId });
    await seedStartingPoint(db, { agencyId });
    await seedSetup(db, { agencyId });
    await seedInviteSetup(db);
    await seedNavigation(db, { agencyId });

    await seedAsk(db, { agencyId, competitorId: comp!.id, eventId: workspace.eventId, evidenceId: workspace.evidenceId });

    await seedRunbook(db, { agencyId });

    // 15b-1 (`help.spec.ts`): the real page guides, topic articles and glossary, exactly as `kb:seed` publishes them.
    await seedKnowledge(db, resolve(import.meta.dirname, '../../../docs/help'));

    const token = signLink(E2E_LINK_SECRET, { sub: ownerContact!.id, agency: agencyId, client: clientId, t: 'brief', id: briefId });
    await mkdir(dirname(OWNER_LINK_FILE), { recursive: true });
    await writeFile(OWNER_LINK_FILE, `http://localhost:${process.env.E2E_PORT ?? 3100}/l/${token}`);

    // Phase 10: the seeded agencies stand in for pre-Phase-10 agencies, which migration 0066 backfills as completed
    // `legacy` onboarding. Without a row the getting-started checklist shows on /agency (and pushes the portfolio down).
    await db.execute(sql`
      insert into agency_onboarding (agency_id, source, completed_at)
      select id, 'legacy', now() from agency
      on conflict do nothing`);
  } finally {
    await close();
  }

  await rm(OUTBOX, { recursive: true, force: true });
  await mkdir(OUTBOX, { recursive: true });
}

// Sorts after 'E2E Agency': kb.spec.ts picks the agency select's index 1.
export const CB_AGENCY = 'Metro Billing Agency E2E';
export const CB_CLIENT = 'Furnace Billing Co';
export const CB_USERS = { admin: 'cb-admin@e2e.test', owner: 'cb-owner@e2e.test', viewer: 'cb-viewer@e2e.test' } as const;

const DAY = 86_400_000;
const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
const SHA = 'a'.repeat(64);
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** 5c-1: a tracked page with two web captures + evidence, a price-change event with a move, and a Google Ads history. */
async function seedWorkspace(
  db: ReturnType<typeof createDb>['db'],
  o: { agencyId: string; clientId: string; competitorId: string; sentItemId: string },
): Promise<{ eventId: string; evidenceId: string }> {
  const { agencyId, clientId, competitorId } = o;
  const store = createStoreFromEnv({ ...process.env, EVIDENCE_FS_DIR: resolveEvidenceDir(resolve(import.meta.dirname, '../test-results/evidence'), resolve(import.meta.dirname, '..'))! });
  const [page] = await db.insert(trackedPage).values({ competitorId, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'manual', cadence: 'daily' }).returning();

  const caps: { id: string; shot: string }[] = [];
  for (const days of [2, 1]) {
    const [c] = await db.insert(capture).values({ competitorId, trackedPageId: page!.id, source: 'web', url: page!.url, status: 'ok', collectorVersion: 'e2e', capturedAt: new Date(Date.now() - days * DAY) }).returning();
    let shot = '';
    for (const [kind, name, contentType, body] of [
      ['screenshot', 'screenshot.webp', 'image/webp', WEBP],
      ['text', 'text.txt', 'text/plain', Buffer.from('AC tune-up')],
      ['html', 'page.html', 'text/html', Buffer.from('<p>AC tune-up</p>')],
    ] as const) {
      const objectKey = `evidence/${competitorId}/${c!.id}/${name}`;
      await store.put(objectKey, body, contentType, { overwrite: true });
      const [ev] = await db.insert(evidence).values({ captureId: c!.id, kind, objectKey, sha256: SHA, bytes: body.length, contentType }).returning();
      if (kind === 'screenshot') shot = ev!.id;
    }
    caps.push({ id: c!.id, shot });
  }
  const [before, after] = caps as [(typeof caps)[number], (typeof caps)[number]];

  const [ch] = await db.insert(detectedChange).values({
    competitorId, trackedPageId: page!.id, source: 'web', kind: 'modified', beforeCaptureId: before.id, afterCaptureId: after.id,
    beforeText: 'AC tune-up $99', afterText: 'AC tune-up $79', status: 'event', stageVersion: 1, detectedAt: new Date(Date.now() - DAY),
  }).returning();
  const occurredAt = new Date(Date.now() - DAY);
  const [ev] = await db.insert(changeEvent).values({
    competitorId, changeType: 'price_change', channels: ['web'], services: { hvac_plumbing: 'ac_tune_up' },
    summary: 'Smith HVAC cut its AC tune-up to $79 (was $99)',
    facts: [{ kind: 'price', before: { kind: 'price', value: 99, unit: 'USD', raw: '$99', context: 'AC tune-up' }, after: { kind: 'price', value: 79, unit: 'USD', raw: '$79', context: 'AC tune-up' }, pct: -20.2 }],
    confidence: 0.9, occurredAt,
  }).returning();
  await db.insert(eventChange).values({ eventId: ev!.id, changeId: ch!.id });
  await db.insert(eventScore).values({
    agencyId, clientId, eventId: ev!.id, score: 86, route: 'alert', packVersion: 1, scoredAt: new Date(),
    factors: { typeWeight: 1, size: 0.95, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9, maxSimilarity: 0.1, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 },
  });
  const [mv] = await db.insert(move).values({
    agencyId, clientId, competitorId, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 'Price war',
    details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: occurredAt, lastHeldAt: new Date(), lastEvidenceAt: occurredAt,
  }).returning();
  await db.insert(moveEvent).values({ moveId: mv!.id, eventId: ev!.id });

  const adsAt = new Date(Date.now() - 20 * DAY);
  const [adsCap] = await db.insert(capture).values({ competitorId, source: 'google_ads', status: 'ok', collectorVersion: 'e2e', capturedAt: adsAt }).returning();
  await db.insert(ad).values({ competitorId, platform: 'google', externalId: 'e2e-ad-1', title: 'AC tune-up special', isActive: true, firstSeenAt: adsAt, lastSeenAt: new Date(), firstCaptureId: adsCap!.id, lastCaptureId: adsCap!.id });

  // 5c-2 data views.
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  await db.insert(pricePoint).values([
    { competitorId, trackedPageId: page!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 99, unit: 'USD', qualifier: 'exact', promo: false, raw: '$99', context: 'AC tune-up $99',
      firstSeenAt: ago(120), lastSeenAt: ago(2), firstCaptureId: before.id, lastCaptureId: before.id, endedAt: ago(1), endedCaptureId: after.id },
    { competitorId, trackedPageId: page!.id, verticalId: 'hvac_plumbing', serviceId: 'ac_tune_up', amount: 79, unit: 'USD', qualifier: 'exact', promo: true, raw: '$79', context: 'AC tune-up $79',
      firstSeenAt: ago(1), lastSeenAt: new Date(), firstCaptureId: after.id, lastCaptureId: after.id },
  ]);

  await db.insert(ad).values({ competitorId, platform: 'meta', externalId: 'e2e-meta-1', title: 'Spring AC special', text: 'Book a $49 tune-up this week.', isActive: true, firstSeenAt: adsAt, lastSeenAt: new Date(), firstCaptureId: adsCap!.id, lastCaptureId: adsCap!.id });

  const [self] = await db.insert(competitor).values({ name: 'E2E HVAC', placeId: 'e2e-self-place' }).returning();
  await db.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, clientId));
  const [r1] = await db.insert(review).values({ competitorId, dedupeKey: 'e2e-r1', rating: 2, text: 'The technician was late and pushy.', reviewerHash: 'e2e-hash-1', postedAt: ago(3) }).returning();
  const [r2] = await db.insert(review).values({ competitorId: self!.id, dedupeKey: 'e2e-r2', rating: 5, text: 'Fast and friendly service.', reviewerHash: 'e2e-hash-2', postedAt: ago(4) }).returning();
  await db.insert(reviewAnalysis).values([
    { reviewId: r1!.id, verticalId: 'hvac_plumbing', competitorId, textSha: 'e2e', asked: ['response_time', 'upsell_pressure'], topics: ['response_time', 'upsell_pressure'], sentiment: 0, confidence: 0.9, analysisVersion: 1 },
    { reviewId: r2!.id, verticalId: 'hvac_plumbing', competitorId: self!.id, textSha: 'e2e', asked: ['response_time'], topics: ['response_time'], sentiment: 4, confidence: 0.9, analysisVersion: 1 },
  ]);

  // Phase 13b: three weekly scans (the oldest with a 5×5 grid, so Compare refuses it against the others) and, newest, a
  // manual scan two days ago, which puts "Scan now" on its weekly limit. The newest scan keeps the 5c-2 numbers.
  const res = (rank: number, placeId: string, title: string) => ({ rank, placeId, cid: null, domain: null, title });
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const settings = { radiusKm: 25, keywords: ['ac repair'] };
  const scans = [
    { days: 23, trigger: 'scheduled' as const, gridSize: 5, selfTop: 4 },
    { days: 16, trigger: 'scheduled' as const, gridSize: 7, selfTop: 3 },
    { days: 9, trigger: 'scheduled' as const, gridSize: 7, selfTop: 2 },
    { days: 2, trigger: 'manual' as const, gridSize: 7, selfTop: 1 },
  ];
  for (const s of scans) {
    const [scan] = await db.insert(rankScan).values({
      agencyId, clientId, status: 'done', snapshots: 8, startedAt: ago(s.days), finishedAt: ago(s.days),
      trigger: s.trigger, requestedBy: s.trigger === 'manual' ? 'e2e-admin' : null, gridSize: s.gridSize, ...settings, estimatedUsd: 0.2,
    }).returning();
    const snaps = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 2 && c === 2) continue; // a failed point → "no data"
        const results = r === 0
          ? [res(s.selfTop, 'e2e-self-place', 'E2E HVAC'), res(s.selfTop === 2 ? 1 : 2, 'e2e-smith-place', 'Smith HVAC'), res(s.selfTop === 3 ? 1 : 3, 'e2e-other', 'Other Air')]
          : [res(1, 'e2e-smith-place', 'Smith HVAC'), res(2, 'e2e-other', 'Other Air'), res(3, 'e2e-other-2', 'Third Air'), res(5, 'e2e-self-place', 'E2E HVAC')];
        snaps.push({ agencyId, clientId, scanId: scan!.id, keyword: 'ac repair', lat: round(32.45 - 0.05 * r), lng: round(-97.84 + 0.05 * c), results, capturedAt: ago(s.days) });
      }
    }
    await db.insert(rankSnapshot).values(snaps);
  }
  // A stored map background whose bounds hold every grid point (no Stadia call in E2E: a 1×1 PNG stands in).
  const mapKey = `rank-map/${clientId}/e2e.png`;
  await store.put(mapKey, PNG_1PX, 'image/png', { overwrite: true });
  await db.insert(rankMapImage).values({ clientId, agencyId, settingsHash: 'e2e0000000000000', objectKey: mapKey, bounds: { west: -97.95, south: 32.25, east: -97.63, north: 32.55 }, width: 640, height: 640 });

  await db.update(briefItem).set({ evidenceIds: [after.shot] }).where(eq(briefItem.id, o.sentItemId));
  return { eventId: ev!.id, evidenceId: after.shot };
}

/** 6b: what `ask.spec.ts` reads from `ASK_FIXTURE_FILE`. */
export type AskFixture = {
  /** `ask` + evidence-backed event + starters; review allowed. */
  askCo: { id: string; name: string };
  /** `ask_review_allowed = false`. */
  privateCo: { id: string; name: string };
  /** The client user has already used this month's quota (counted per client). */
  quotaCo: { id: string; name: string };
  /** Agency-admin review-toggle test only. */
  toggleCo: { id: string; name: string };
  /** The client user's seeded threads (author-only). */
  askThreadId: string;
  privateThreadId: string;
  starters: string[];
};

export const ASK_USER_EMAIL = 'asker@e2e.test';
const ASK_USER_ID = 'e2e-asker-user';
const ASK_QUOTA = 2;
const ASK_STARTERS = [
  'What changed with competitor prices this month?',
  'Which competitor is the biggest threat right now?',
  'Are any rivals running new promotions?',
  'What are customers complaining about at rivals?',
];

/**
 * 6b Ask: a client user (`asker@e2e.test`, client_owner of three clients; its auth user exists so threads can be
 * seeded) plus a fourth client for the admin's review toggle. Smith HVAC's price event is also scored for the Ask
 * client, so `search_events` returns it with its evidence. Client names never contain "E2E HVAC" (other specs match it).
 */
async function seedAsk(
  db: ReturnType<typeof createDb>['db'],
  o: { agencyId: string; competitorId: string; eventId: string; evidenceId: string },
): Promise<void> {
  const { agencyId } = o;
  const area = { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] };
  const base = { agencyId, verticalId: 'hvac_plumbing', keywords: ['ac repair'], serviceArea: area };
  const [askCo, privateCo, quotaCo, toggleCo] = await db.insert(client).values([
    { ...base, name: 'Ask Demo Heating', features: ['dashboard', 'ask'] },
    { ...base, name: 'Private Plumbing Co', features: ['dashboard', 'ask'], askReviewAllowed: false },
    { ...base, name: 'Summit Cooling Co', features: ['dashboard', 'ask'], askMonthlyQuota: ASK_QUOTA },
    { ...base, name: 'Toggle Air Co', features: ['ask'] },
  ]).returning({ id: client.id, name: client.name });

  await db.insert(clientCompetitor).values({ agencyId, clientId: askCo!.id, competitorId: o.competitorId });
  await db.insert(eventScore).values({
    agencyId, clientId: askCo!.id, eventId: o.eventId, score: 86, route: 'alert', packVersion: 1, scoredAt: new Date(),
    factors: { typeWeight: 1, size: 0.95, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9, maxSimilarity: 0.1, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 1 },
  });
  await db.insert(askStarter).values({ clientId: askCo!.id, agencyId, questions: ASK_STARTERS });

  // The auth user exists before sign-in (Better Auth finds it by email); memberships come from accepted invitations.
  await db.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${ASK_USER_ID}, 'Asha Asker', ${ASK_USER_EMAIL}, true)`);
  for (const c of [askCo!, privateCo!, quotaCo!]) await createInvitation(db, { agencyId, email: ASK_USER_EMAIL, role: 'client_owner', clientId: c.id, invitedBy: 'e2e-seed' });
  await acceptInvitations(db, { id: ASK_USER_ID, email: ASK_USER_EMAIL, name: 'Asha Asker' });

  const thread = async (clientId: string, title: string, answer: { content: string; citations: string[] } | null, counted = 1) => {
    const [t] = await db.insert(askThread).values({ agencyId, clientId, userId: ASK_USER_ID, title }).returning({ id: askThread.id });
    const m = { threadId: t!.id, agencyId, clientId, userId: ASK_USER_ID };
    for (let i = 0; i < counted; i++) await db.insert(askMessage).values({ ...m, role: 'user', content: title, countsTowardQuota: true });
    if (answer) {
      await db.insert(askMessage).values({
        ...m, role: 'assistant', content: answer.content, citations: answer.citations,
        trace: { model: 'e2e/scripted', guard: 'in_scope', removedSentences: 0, deadlineHit: false, costUsd: 0, steps: [{ tool: 'search_events', args: { clientId, route: 'all', days: 365 }, rows: 1 }] },
      });
    }
    return t!.id;
  };
  const askThreadId = await thread(askCo!.id, 'Seeded question about Smith pricing', { content: `Smith HVAC cut its AC tune-up to $79 [ev:${o.evidenceId}].`, citations: [`ev:${o.evidenceId}`] });
  const privateThreadId = await thread(privateCo!.id, 'Seeded private question', { content: "I don't have evidence for that in the monitored data.", citations: [] });
  // At quota: this month's counted user messages for Quota Cooling Co equal its quota.
  await thread(quotaCo!.id, 'Seeded earlier question', null, ASK_QUOTA);

  const fixture: AskFixture = { askCo: askCo!, privateCo: privateCo!, quotaCo: quotaCo!, toggleCo: toggleCo!, askThreadId, privateThreadId, starters: ASK_STARTERS };
  await mkdir(dirname(ASK_FIXTURE_FILE), { recursive: true });
  await writeFile(ASK_FIXTURE_FILE, JSON.stringify(fixture));
}

/** 12a E2E: what `competitors-rivals.spec.ts` reads from `RIVALS_FIXTURE_FILE`. */
export type RivalsFixture = { clientId: string; trackedMetaId: string };
export const RIVALS_CLIENT_NAME = 'Rivals Heating Co';

type SeedSignals = Record<string, unknown>;
const NO_SIGNALS: SeedSignals = {
  rating: null, votes: null, reviews30d: null, reviews90d: null, replyRate: null, googleAdsActive: null, googleAdsNew30d: null, googleAccount: null,
  metaPage: null, metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null,
};

/**
 * 12a: no worker runs in E2E, so the finished discovery run, its tiered suggestions (two top rivals, one watch with
 * unchecked signals, one minor), the hidden list, tracked competitors with ratings and ad matches are all written
 * directly. The tracked competitor with a matched Meta page is tracked by this client only (Ruling 7), so removing it works.
 */
async function seedRivals(db: ReturnType<typeof createDb>['db'], o: { agencyId: string }): Promise<void> {
  const { agencyId } = o;
  const [c] = await db.insert(client).values({
    agencyId, name: RIVALS_CLIENT_NAME, verticalId: 'hvac_plumbing', features: ['dashboard', 'manage_competitors'], keywords: ['ac repair'],
    serviceArea: { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] }, placeId: 'e2e-rivals-self-place',
  }).returning({ id: client.id });
  const clientId = c!.id;
  // The Ask client user also owns this client (accepted in seedAsk), so no extra magic-link sign-in is needed.
  await createInvitation(db, { agencyId, email: ASK_USER_EMAIL, role: 'client_owner', clientId, invitedBy: 'e2e-seed' });

  const [run] = await db.insert(discoveryRun).values({
    agencyId, clientId, trigger: 'manual', status: 'done', kept: 4, startedAt: new Date(Date.now() - 3600_000), finishedAt: new Date(Date.now() - 3000_000),
    hidden: { wrong_category: 1, outside_area: 1 },
    progress: { searchesDone: 9, searchesTotal: 9, checksDone: 4, checksTotal: 4, hiddenList: [{ name: 'Bluestem Hardware Supply', reason: 'wrong_category' }, { name: 'Tarrant Valley Mechanical', reason: 'outside_area' }] },
  }).returning({ id: discoveryRun.id });
  const checked: SeedSignals = { ...NO_SIGNALS, rating: 4.7, votes: 212, reviews30d: 9, googleAdsActive: 4, googleAdsNew30d: 2, googleAccount: 'matched', metaPage: 'none', claimed: true, chain: false, categoryMatch: 'main', distanceKm: 3.1, presence: { searches: 9, appeared: 8, bestRank: 1 } };
  const rows: { name: string; tier: 'top' | 'watch' | 'minor'; overlap: number; activity: number; signals: SeedSignals }[] = [
    { name: 'Granbury Cooling Pros', tier: 'top', overlap: 0.92, activity: 0.8, signals: checked },
    { name: 'Lakeview Air and Heat', tier: 'top', overlap: 0.85, activity: 0.55, signals: { ...checked, rating: 4.5, votes: 140, googleAdsActive: 2, googleAdsNew30d: 0 } },
    { name: 'Hood County Comfort', tier: 'watch', overlap: 0.62, activity: 0.3, signals: { ...NO_SIGNALS, rating: 4.1, votes: 40, categoryMatch: 'related', distanceKm: 11, presence: { searches: 9, appeared: 4, bestRank: 4 } } },
    { name: 'Comanche Peak Plumbing', tier: 'minor', overlap: 0.2, activity: 0.05, signals: { ...NO_SIGNALS, rating: 3.9, votes: 12, claimed: false, chain: false, presence: { searches: 9, appeared: 1, bestRank: 12 } } },
  ];
  await db.insert(competitorSuggestion).values(rows.map((r, i) => ({
    agencyId, clientId, name: r.name, domain: null, placeId: `e2e-rivals-sugg-${i}`, cid: null, rating: r.signals.rating as number, votes: r.signals.votes as number,
    appearances: 1, bestRank: 1, overlapScore: r.overlap, status: 'suggested', runId: run!.id, category: 'HVAC contractor',
    distanceKm: r.signals.distanceKm as number | null, overlap: r.overlap, activity: r.activity, tier: r.tier, signals: r.signals, adMatches: [],
  })));

  // Tracked: one sole-tracked competitor with a matched Meta page and a weak Google match pending, one unrated.
  const trackedMetaId = '4242000000001';
  const [solo, unrated] = await db.insert(competitor).values([
    { name: 'Brazos Valley Air', placeId: 'e2e-rivals-tracked-1', metaPageIds: [trackedMetaId] },
    { name: 'Paluxy Heating', placeId: 'e2e-rivals-tracked-2' },
  ]).returning({ id: competitor.id });
  await db.insert(clientCompetitor).values([
    { agencyId, clientId, competitorId: solo!.id, pendingAdMatches: [{ platform: 'google', accountId: 'AR4200000000000000001', name: 'Brazos Valley Air LLC', strength: 'weak' }] },
    { agencyId, clientId, competitorId: unrated!.id },
  ]);
  await db.insert(competitorSignal).values({ agencyId, clientId, competitorId: solo!.id, tier: 'top', overlap: 0.9, activity: 0.7, signals: checked, computedAt: new Date(Date.now() - 2 * DAY) });

  await mkdir(dirname(RIVALS_FIXTURE_FILE), { recursive: true });
  await writeFile(RIVALS_FIXTURE_FILE, JSON.stringify({ clientId, trackedMetaId } satisfies RivalsFixture));
}

/** 12b E2E: what `starting-point.spec.ts` reads from `STARTING_FIXTURE_FILE`. */
export type StartingPointFixture = {
  fresh: { id: string; name: string };
  ready: { id: string; name: string; briefId: string };
  quiet: { id: string; name: string; sentBriefId: string; quietBriefId: string };
};
export const SP_FRESH_NAME = 'Fresh Start Plumbing';
export const SP_READY_NAME = 'Starting Point Heating';
export const SP_QUIET_NAME = 'Quiet Week Cooling';

type SpValues = Record<'rating' | 'reviews90d' | 'replyRate' | 'mapTop3Share' | 'adsActive' | 'metaAdsActive', number | null>;
const SP_METRICS = ['rating', 'reviews90d', 'replyRate', 'mapTop3Share'] as const;
const SP_RIVALS: { name: string; tier: 'top' | 'watch'; values: SpValues }[] = [
  { name: 'Granbury Cooling Pros', tier: 'top', values: { rating: 4.7, reviews90d: 30, replyRate: 0.7, mapTop3Share: 0.4, adsActive: 2, metaAdsActive: null } },
  { name: 'Lakeview Air and Heat', tier: 'watch', values: { rating: 4.5, reviews90d: 14, replyRate: 0.5, mapTop3Share: 0.2, adsActive: 0, metaAdsActive: null } },
];
const SP_SELF: SpValues = { rating: 4.4, reviews90d: 6, replyRate: 0.2, mapTop3Share: 0.1, adsActive: 0, metaAdsActive: null };
const spMedian = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  return v.length === 0 ? null : v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
};
function spScorecard(name: string, self: SpValues, base: { briefId: string; self: SpValues } | null, openFirstMoves: { recommendationId: string; title: string }[]) {
  return {
    asOf: new Date().toISOString(), baselineBriefId: base?.briefId ?? null,
    tiles: SP_METRICS.map((metric) => ({
      metric, you: self[metric], rivalMedian: spMedian(SP_RIVALS.map((r) => r.values[metric])),
      deltaSinceStart: base && self[metric] !== null && base.self[metric] !== null ? Math.round((self[metric]! - base.self[metric]!) * 100) / 100 : null,
    })),
    rows: [{ competitorId: null, name, self: true, tier: null, values: self }, ...SP_RIVALS.map((r) => ({ competitorId: null, name: r.name, self: false, tier: r.tier, values: r.values }))],
    evidenceIds: [], openFirstMoves,
  };
}

/**
 * 12b: no worker runs in E2E. A fresh client (progress card), a ready starting point for the agency to approve (sent at
 * once, 12b Q2), and a client whose starting point was sent earlier with a quiet week since (deltas up and down, open
 * first moves). The Ask client user owns all three (accepted in `seedAsk`), so no extra magic-link sign-in is needed.
 */
async function seedStartingPoint(db: ReturnType<typeof createDb>['db'], o: { agencyId: string }): Promise<void> {
  const { agencyId } = o;
  const base = { agencyId, verticalId: 'hvac_plumbing', features: ['dashboard'], keywords: ['ac repair'], serviceArea: { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] } };
  const [fresh, ready, quiet] = await db.insert(client).values([
    { ...base, name: SP_FRESH_NAME, placeId: 'e2e-sp-fresh-place' },
    { ...base, name: SP_READY_NAME },
    { ...base, name: SP_QUIET_NAME },
  ]).returning({ id: client.id, name: client.name });
  for (const c of [fresh!, ready!, quiet!]) await createInvitation(db, { agencyId, email: ASK_USER_EMAIL, role: 'client_owner', clientId: c.id, invitedBy: 'e2e-seed' });

  const findings = [
    { headline: 'Ask more customers for a review', fact: 'You got 6 new reviews in 90 days; Granbury Cooling Pros got 30.', why: 'Review count and freshness help decide who shows first on Google Maps.', action: 'Text every customer a Google review link right after the job is done.', playbookId: 'ask_for_reviews', effort: 'L', impact: 'H', upsellTag: null },
    { headline: 'Try a small Google search ads budget', fact: 'Granbury Cooling Pros run ads; you run none.', why: 'Ads put rivals above the map results for searches you could be winning.', action: 'Run a small Google search campaign for your main repair service.', playbookId: 'consider_search_ads', effort: 'M', impact: 'M', upsellTag: 'ppc_audit' },
    { headline: 'Promote what customers praise', fact: 'Customers mention punctuality in 24% of your reviews vs 9% for rivals.', why: 'Something reviewers keep praising is a reason to choose you.', action: 'Feature punctuality as a strength on your website and Google profile.', playbookId: 'promote_strength', effort: 'L', impact: 'M', upsellTag: null },
  ];
  const itemRows = (briefId: string, clientId: string) => findings.map((f, k) => ({
    briefId, agencyId, clientId, ord: k + 1, competitorId: null, subject: 'self' as const, headline: f.headline, whatChanged: f.fact, whyItMatters: f.why, recommendedAction: f.action,
    confidence: 1, effort: f.effort, impact: f.impact, playbookId: f.playbookId, upsellTag: f.upsellTag,
  }));
  const intro = (name: string) => `Where ${name} stands against the 2 rivals we now watch. Weekly briefs from here show what changes.`;
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const [readyBrief] = await db.insert(brief).values({
    agencyId, clientId: ready!.id, deliveryDate: '2026-10-13', periodStart: day('2026-10-11'), periodEnd: day('2026-10-13'), kind: 'starting_point', status: 'ready',
    summary: intro(SP_READY_NAME), scorecard: spScorecard(SP_READY_NAME, SP_SELF, null, []), dropped: { items: 0, sentences: 0 },
  }).returning({ id: brief.id });
  await db.insert(briefItem).values(itemRows(readyBrief!.id, ready!.id));

  const [sent] = await db.insert(brief).values({
    agencyId, clientId: quiet!.id, deliveryDate: '2026-09-22', periodStart: day('2026-09-20'), periodEnd: day('2026-09-22'), kind: 'starting_point', status: 'sent',
    summary: intro(SP_QUIET_NAME), scorecard: spScorecard(SP_QUIET_NAME, SP_SELF, null, []), dropped: { items: 0, sentences: 0 }, approvedAt: day('2026-09-22'), sentAt: day('2026-09-22'),
  }).returning({ id: brief.id });
  const sentItems = await db.insert(briefItem).values(itemRows(sent!.id, quiet!.id)).returning({ id: briefItem.id });
  const [rec] = await db.insert(recommendation).values({
    agencyId, clientId: quiet!.id, title: findings[0]!.action, rationale: findings[0]!.why, briefItemId: sentItems[0]!.id, playbookId: findings[0]!.playbookId, effort: 'L', impact: 'H',
    owner: 'client', status: 'todo', source: 'brief',
  }).returning({ id: recommendation.id });
  const now: SpValues = { ...SP_SELF, rating: 4.5, reviews90d: 10, replyRate: 0.15 };
  const [quietBrief] = await db.insert(brief).values({
    agencyId, clientId: quiet!.id, deliveryDate: '2026-10-12', periodStart: day('2026-10-05'), periodEnd: day('2026-10-12'), kind: 'quiet', status: 'sent',
    summary: 'No significant competitor changes this week.', scorecard: spScorecard(SP_QUIET_NAME, now, { briefId: sent!.id, self: SP_SELF }, [{ recommendationId: rec!.id, title: findings[0]!.action }]),
    dropped: { items: 0, sentences: 0 }, approvedAt: day('2026-10-12'), sentAt: day('2026-10-12'),
  }).returning({ id: brief.id });

  const fixture: StartingPointFixture = {
    fresh: { id: fresh!.id, name: fresh!.name },
    ready: { id: ready!.id, name: ready!.name, briefId: readyBrief!.id },
    quiet: { id: quiet!.id, name: quiet!.name, sentBriefId: sent!.id, quietBriefId: quietBrief!.id },
  };
  await mkdir(dirname(STARTING_FIXTURE_FILE), { recursive: true });
  await writeFile(STARTING_FIXTURE_FILE, JSON.stringify(fixture));
}

/** 11a E2E: what `client-setup.spec.ts` reads from `SETUP_FIXTURE_FILE`. */
export type SetupFixture = {
  finish: { id: string; name: string };
  owner: { id: string; name: string };
  badge: { id: string; name: string };
  closed: { id: string; name: string };
};
export const SETUP_OWNER_EMAIL = 'setup-owner@e2e.test';

/**
 * 11a: no worker runs in E2E, so four open/closed setups are written directly (P5). Every open one has a done discovery
 * run (so saving the profile never starts an auto search: `startFirstAutoSearch` skips clients with any run) and tiered
 * suggestions. `finish` has a complete profile (opens on the pick step; staff finish it), `owner` has an empty profile
 * with ready Google suggestions (its owner edits the profile, then picks), `badge` stays open untouched (portfolio
 * badge), `closed` is completed (its owner gets 404). The setup owner owns `owner` and `closed`.
 */
async function seedSetup(db: ReturnType<typeof createDb>['db'], o: { agencyId: string }): Promise<void> {
  const { agencyId } = o;
  const area = { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] };
  const base = { agencyId, verticalId: 'hvac_plumbing', features: ['dashboard'] };
  const [finish, owner, badge, closed] = await db.insert(client).values([
    { ...base, name: 'Setup Finish Plumbing', keywords: ['plumber near me'], serviceArea: area, placeId: 'e2e-setup-finish-place' },
    { ...base, name: 'Setup Owner Heating' },
    { ...base, name: 'Setup Badge Cooling' },
    { ...base, name: 'Setup Closed Air', keywords: ['ac repair'], serviceArea: area, placeId: 'e2e-setup-closed-place' },
  ]).returning({ id: client.id, name: client.name });

  const ready = {
    status: 'ready' as const,
    services: [{ value: 'ac_repair', quote: 'Air conditioning repair and installation' }],
    keywords: [{ value: 'ac repair near me', quote: 'Air conditioning repair and installation' }],
    newAreas: [{ name: 'Radiant floor heating', quote: 'Radiant floor heating' }],
    sources: ['gbp' as const],
    generatedAt: new Date().toISOString(),
  };
  await db.insert(clientSetup).values([
    { clientId: finish!.id, agencyId, suggestions: { status: 'none' } },
    { clientId: owner!.id, agencyId, suggestions: ready },
    { clientId: badge!.id, agencyId, suggestions: { status: 'none' } },
    { clientId: closed!.id, agencyId, suggestions: { status: 'none' }, competitorsDoneAt: new Date(), completedAt: new Date() },
  ]);

  const rowsFor = (clientId: string, runId: string, names: { name: string; tier: 'top' | 'watch' | 'minor'; overlap: number }[]) =>
    names.map((r, i) => ({
      agencyId, clientId, name: r.name, domain: null, placeId: `e2e-setup-${clientId}-${i}`, cid: null, rating: 4.5, votes: 100, appearances: 1, bestRank: 1,
      overlapScore: r.overlap, status: 'suggested', runId, category: 'HVAC contractor', distanceKm: 3 + i, overlap: r.overlap, activity: 0.5, tier: r.tier, signals: NO_SIGNALS, adMatches: [],
    }));
  const doneRun = (clientId: string, kept: number) => ({ agencyId, clientId, trigger: 'auto' as const, status: 'done' as const, kept, startedAt: new Date(Date.now() - 3600_000), finishedAt: new Date(Date.now() - 3000_000), hidden: {} });
  const [finishRun, ownerRun] = await db.insert(discoveryRun).values([doneRun(finish!.id, 4), doneRun(owner!.id, 2), doneRun(badge!.id, 0), doneRun(closed!.id, 0)]).returning({ id: discoveryRun.id });
  await db.insert(competitorSuggestion).values([
    ...rowsFor(finish!.id, finishRun!.id, [
      { name: 'Setup Rival One Plumbing', tier: 'top', overlap: 0.9 },
      { name: 'Setup Rival Two Plumbing', tier: 'top', overlap: 0.85 },
      { name: 'Setup Watch Plumbing', tier: 'watch', overlap: 0.6 },
      { name: 'Setup Minor Plumbing', tier: 'minor', overlap: 0.2 },
    ]),
    ...rowsFor(owner!.id, ownerRun!.id, [
      { name: 'Owner Rival Heating', tier: 'top', overlap: 0.9 },
      { name: 'Owner Watch Heating', tier: 'watch', overlap: 0.6 },
    ]),
  ]);

  await createInvitation(db, { agencyId, email: SETUP_OWNER_EMAIL, role: 'client_owner', clientId: owner!.id, invitedBy: 'e2e-seed' });
  await createInvitation(db, { agencyId, email: SETUP_OWNER_EMAIL, role: 'client_owner', clientId: closed!.id, invitedBy: 'e2e-seed' });

  await mkdir(dirname(SETUP_FIXTURE_FILE), { recursive: true });
  await writeFile(SETUP_FIXTURE_FILE, JSON.stringify({
    finish: finish!, owner: owner!, badge: badge!, closed: closed!,
  } satisfies SetupFixture));
}

/** 15a E2E (`navigation.spec.ts`): a client with more sent weekly briefs than one Briefs & reports page holds (20). */
export const NAV_ARCHIVE_NAME = 'Archive Heating Co';
export const NAV_ARCHIVE_BRIEFS = 22;

async function seedNavigation(db: ReturnType<typeof createDb>['db'], o: { agencyId: string }): Promise<void> {
  const { agencyId } = o;
  const [c] = await db.insert(client).values({
    agencyId, name: NAV_ARCHIVE_NAME, verticalId: 'hvac_plumbing', features: ['dashboard', 'ask'], keywords: ['furnace repair'],
    serviceArea: { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] },
  }).returning({ id: client.id });
  // Weekly Mondays from 2026-03-02; week n's summary names n, newest (n = 22) first in the list.
  await db.insert(brief).values(Array.from({ length: NAV_ARCHIVE_BRIEFS }, (_, i) => {
    const monday = new Date(Date.UTC(2026, 2, 2) + i * 7 * DAY);
    const iso = monday.toISOString().slice(0, 10);
    return {
      agencyId, clientId: c!.id, deliveryDate: iso, periodStart: new Date(monday.getTime() - 7 * DAY), periodEnd: monday, status: 'sent' as const,
      summary: `Archive week ${i + 1}: a quiet week for rivals.`, approvedAt: monday, sentAt: monday,
    };
  }));
}

/** 11b E2E (`client-setup-invite.spec.ts`): an exempt-pilot agency with three open setups, looked up by name. */
export const SI_AGENCY = 'Invite Setup Agency E2E';
export const SI_ADMIN = 'si-admin@e2e.test';
export const SI_STEP4 = 'Invite Step Four Plumbing'; // picks done: the Invite step is current
export const SI_STEP3 = 'Invite Step Three Heating'; // picks open: staff invite from the side panel, the owner still has work
export const SI_BILLING = 'Invite Billing Step Air'; // invite skipped, a pending owner invitation: the Billing step is current
export const SI_PENDING_OWNER = 'si-pending-owner@e2e.test';

async function seedInviteSetup(db: ReturnType<typeof createDb>['db']): Promise<void> {
  const [a] = await db.insert(agency).values({ name: SI_AGENCY }).returning();
  const agencyId = a!.id;
  await ensureExemptPilot(db, agencyId);
  await createInvitation(db, { agencyId, email: SI_ADMIN, role: 'agency_admin', invitedBy: 'e2e-seed' });
  const area = { center: { lat: 32.4, lng: -97.79 }, radiusKm: 25, zips: ['76048'] };
  const base = { agencyId, verticalId: 'hvac_plumbing', features: ['dashboard'], keywords: ['plumber near me'], serviceArea: area };
  const [step4, step3, billing] = await db.insert(client).values([
    { ...base, name: SI_STEP4, placeId: 'e2e-si-step4-place' },
    { ...base, name: SI_STEP3, placeId: 'e2e-si-step3-place' },
    { ...base, name: SI_BILLING, placeId: 'e2e-si-billing-place' },
  ]).returning({ id: client.id });
  await db.insert(clientSetup).values([
    { clientId: step4!.id, agencyId, competitorsDoneAt: new Date() },
    { clientId: step3!.id, agencyId },
    { clientId: billing!.id, agencyId, competitorsDoneAt: new Date(), skipped: ['invite'] },
  ]);
  // A done search each, so saving or reading the setup never starts a paid auto search.
  await db.insert(discoveryRun).values([step4!, step3!, billing!].map((c) => ({
    agencyId, clientId: c.id, trigger: 'auto' as const, status: 'done' as const, kept: 0, startedAt: new Date(Date.now() - 3600_000), finishedAt: new Date(Date.now() - 3000_000), hidden: {},
  })));
  await createInvitation(db, { agencyId, email: SI_PENDING_OWNER, role: 'client_owner', clientId: billing!.id, invitedBy: 'e2e-seed' });
  await seedIntake(db, agencyId);
}

/** 11c E2E (`intake.spec.ts`): the Invite Setup agency's intake link, a verified lead with a ready preview, and a verified pool lead. */
export const IN_SLUG = 'e2e-invite';
export const IN_LEAD = { business: 'Seeded Lead Dental', contact: 'Harper Seed', email: 'lead-seed@e2e.test' } as const;
export const IN_POOL = { business: 'Pool Seed Plumbing', contact: 'Pat Pool', email: 'pool-seed@e2e.test' } as const;

async function seedIntake(db: ReturnType<typeof createDb>['db'], agencyId: string): Promise<void> {
  await db.insert(intakeLink).values({ agencyId, slug: IN_SLUG });
  const place = (n: number, title: string, category: string) => ({
    placeId: `e2e-intake-place-${n}`, cid: null, title, address: `${n} Main St, Granbury, TX 76048`, city: 'Granbury', category, phone: null, domain: null, rating: 4.4, votes: 80, lat: 32.44, lng: -97.79,
  });
  const verified = { status: 'verified' as const, verifiedAt: new Date(), confirmationSentAt: new Date(), agencyNotifiedAt: new Date(), poolNotifiedAt: new Date() };
  // The worker does not run in E2E, so the preview is written directly.
  const preview = {
    status: 'ready' as const, self: { name: IN_LEAD.business, rating: 4.4, votes: 80 },
    nearby: [{ name: 'Seed Rival Dental', rating: 4.8, votes: 300, distanceKm: 1.5 }],
    facts: ['One nearby dentist has a higher rating than you.'], summary: null, category: 'Dentist', generatedAt: new Date().toISOString(),
  };
  await db.insert(lead).values([
    { agencyId, source: 'agency_link', contactName: IN_LEAD.contact, email: IN_LEAD.email, lookup: place(1, IN_LEAD.business, 'Dentist'), preview, ...verified },
    { agencyId: null, source: 'platform', contactName: IN_POOL.contact, email: IN_POOL.email, lookup: place(2, IN_POOL.business, 'Plumber'), preview: { status: 'none' }, ...verified },
  ]);
}

/** Phase 14b: a Distillery-type client (a catalogue type without own plays, so it uses the agency runbook) with a tailored client runbook; the Ask client user owns it (the 404 check). */
export const RB_CLIENT = 'Distillery Runbook Co';
export const RB_TAILORED_KEY = 'play:promo_blitz_counter';
export const RB_TAILORED_TEXT = 'Tailored for a distillery: answer {{competitor}} with a tasting-room bundle instead of discounting.';

async function seedRunbook(db: ReturnType<typeof createDb>['db'], o: { agencyId: string }): Promise<void> {
  const { agencyId } = o;
  await db.insert(vertical).values({ id: 'e2e_distillery', name: 'Bespoke toy workshops', status: 'reviewed', version: 1, gbpCategories: ['E2E toy workshop'] });
  await db.insert(businessArea).values({ verticalId: 'e2e_distillery', id: 'tasting_room', name: 'Toy tasting room', status: 'reviewed' });
  const catalog = createCatalog(() => catalogRows(db), { ttlMs: 0 });
  const agencyRunbookId = await ensureAgencyRunbook(db, agencyId, await catalog.generic());
  const [c] = await db.insert(client).values({ agencyId, name: RB_CLIENT, verticalId: 'e2e_distillery', features: ['dashboard'], keywords: ['craft distillery'], serviceArea: { center: { lat: 30.2, lng: -98.0 }, radiusKm: 25, zips: ['78620'] }, placeId: 'e2e-distillery-place' }).returning();
  const [rival] = await db.insert(competitor).values({ name: 'Rival Spirits Distillers', placeId: 'e2e-rival-spirits-place' }).returning();
  await db.insert(clientCompetitor).values({ agencyId, clientId: c!.id, competitorId: rival!.id });
  // What the tailoring job would leave behind: the agency runbook's items, one play reworded for the client.
  const items = copyItems(await readRunbookItems(db, agencyRunbookId)).map((i) =>
    i.key === RB_TAILORED_KEY ? { ...i, customised: true, content: { ...(i.content as object), template: RB_TAILORED_TEXT } } : i);
  await createClientRunbookIfAbsent(db, c!.id, items, 'e2e-seed');
  await createInvitation(db, { agencyId, email: ASK_USER_EMAIL, role: 'client_owner', clientId: c!.id, invitedBy: 'e2e-seed' });
  await acceptInvitations(db, { id: ASK_USER_ID, email: ASK_USER_EMAIL, name: 'Asha Asker' });
}

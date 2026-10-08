import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { signLink } from '@cs/core';
import { ad, agency, alert, brief, briefItem, capture, changeEvent, client, clientCompetitor, competitor, contact, createDb, detectedChange, eventChange, eventScore, evidence, llmCall, move, moveEvent, prospectReport, themeProposal, trackedPage } from '@cs/db';
import { createStoreFromEnv } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { createInvitation } from '@cs/tools';
import { resolveEvidenceDir } from '../src/server/files';
import { E2E_LINK_SECRET, OUTBOX, OWNER_LINK_FILE } from '../playwright.config';

/**
 * Seeds `cs_test` for the E2E smoke run: one agency, one client, one competitor, a sent brief, an invitation and a
 * client contact; plus (5b-2) near-cap spend, a prospect with a ready snapshot, and a pending theme proposal.
 */
export async function seed(): Promise<void> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [a] = await db.insert(agency).values({ name: 'E2E Agency', branding: { primary: '#7A3EE8' } }).returning();
    const agencyId = a!.id;

    const [c] = await db.insert(client).values({ agencyId, name: 'E2E HVAC', verticalId: 'hvac_plumbing', features: ['dashboard', 'alert_rules', 'manage_competitors'] }).returning();
    const clientId = c!.id;

    const [comp] = await db.insert(competitor).values({ name: 'Smith HVAC' }).returning();
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

    await seedWorkspace(db, { agencyId, clientId, competitorId: comp!.id, sentItemId: sentItem!.id });

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

    // 5b-2: spend near the cap (decision 6), a prospect with a ready snapshot (decisions 8–11), a pending theme proposal (decision 4).
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
    await db.insert(themeProposal).values({ verticalId: 'hvac_plumbing', themeId: 'e2e_hidden_fees', name: 'E2E hidden fees', description: 'Unexpected trip fees', otherCount: 12, sampleReviewIds: [] });

    const [ownerContact] = await db.insert(contact).values({ agencyId, clientId, role: 'client_owner', email: 'owner@e2e.test' }).returning();

    const token = signLink(E2E_LINK_SECRET, { sub: ownerContact!.id, agency: agencyId, client: clientId, t: 'brief', id: briefId });
    await mkdir(dirname(OWNER_LINK_FILE), { recursive: true });
    await writeFile(OWNER_LINK_FILE, `http://localhost:3100/l/${token}`);
  } finally {
    await close();
  }

  await rm(OUTBOX, { recursive: true, force: true });
  await mkdir(OUTBOX, { recursive: true });
}

const DAY = 86_400_000;
const WEBP = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
const SHA = 'a'.repeat(64);

/** 5c-1: a tracked page with two web captures + evidence, a price-change event with a move, and a Google Ads history. */
async function seedWorkspace(
  db: ReturnType<typeof createDb>['db'],
  o: { agencyId: string; clientId: string; competitorId: string; sentItemId: string },
): Promise<void> {
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
      await store.put(objectKey, body, contentType);
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

  await db.update(briefItem).set({ evidenceIds: [after.shot] }).where(eq(briefItem.id, o.sentItemId));
}

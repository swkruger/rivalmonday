import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { signLink } from '@cs/core';
import { agency, alert, brief, briefItem, changeEvent, client, clientCompetitor, competitor, contact, createDb } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { E2E_LINK_SECRET, OUTBOX, OWNER_LINK_FILE } from '../playwright.config';

/** Seeds `cs_test` for the E2E smoke run: one agency, one client, one competitor, a sent brief, an invitation and a client contact. */
export async function seed(): Promise<void> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const [a] = await db.insert(agency).values({ name: 'E2E Agency', branding: { primary: '#7A3EE8' } }).returning();
    const agencyId = a!.id;

    const [c] = await db.insert(client).values({ agencyId, name: 'E2E HVAC', verticalId: 'hvac_plumbing' }).returning();
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

    await db.insert(briefItem).values({
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
    });

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

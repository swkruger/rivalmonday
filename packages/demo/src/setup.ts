import { client, clientSetup, contact, competitorSuggestion, discoveryRun, type SetupLookup, type SetupSuggestions } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { eq } from 'drizzle-orm';
import type { SeedContext } from './context';
import { CANDIDATES } from './rivals';
import { SETUP_PENDING_PLACE_ID } from './tenancy';
import { DEMO_DOMAIN } from './users';

/** Six fictional plumbers around Granbury for the mid-setup client: two of each tier (picked from the shared candidate shapes). */
const SETUP_RIVALS: { name: string; candidate: number }[] = [
  { name: 'Lakeshore Rooter & Plumbing', candidate: 0 },
  { name: 'Hood County Pipe Works', candidate: 1 },
  { name: 'Mustang Creek Plumbing', candidate: 2 },
  { name: 'Tolar Water & Drain', candidate: 3 },
  { name: 'Two Rivers Plumbing Repair', candidate: 5 },
  { name: 'Oak Hollow Handyman & Plumbing', candidate: 6 },
];

const LOOKUP: SetupLookup = {
  placeId: SETUP_PENDING_PLACE_ID, cid: '9000000000000000001', title: 'Cedar Creek Plumbing', address: '412 Cedar Creek Rd, Granbury, TX 76048',
  city: 'Granbury', category: 'Plumber', phone: '(817) 555-0173', domain: 'cedar-creek-plumbing.example', rating: 4.8, votes: 96, lat: 32.4396, lng: -97.8013,
};

/**
 * Phase 11a: the setup wizard's demo state. Cedar Creek Plumbing is mid-setup (place picked, AI suggestions ready, a finished
 * competitor search waiting for picks); every other client counts as set up, so `/c/<id>/setup` shows "Setup finished" for them.
 */
export async function seedSetup(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const pending = ids.clients.setupPending;
  const others = (await db.select({ id: client.id, agencyId: client.agencyId, createdAt: client.createdAt }).from(client)).filter((c) => c.id !== pending);
  await db.insert(clientSetup).values(others.map((c) => ({
    clientId: c.id, agencyId: c.agencyId, source: 'staff' as const, competitorsDoneAt: c.createdAt, completedAt: c.createdAt, createdAt: c.createdAt,
  })));

  const suggestions: SetupSuggestions = {
    status: 'ready',
    services: [
      { value: 'water_heater', quote: 'Tank and tankless water heater repair and replacement, same-day when we can.' },
      { value: 'leak_repair', quote: 'Burst pipe or slow leak under the sink? We find it and fix it the same visit.' },
    ],
    keywords: [
      { value: 'plumber granbury tx', quote: 'Cedar Creek Plumbing — family-owned plumber serving Granbury and Hood County since 2011.' },
      { value: 'water heater replacement', quote: 'Our most requested job is replacing a failing water heater, usually in under a day.' },
      { value: 'emergency plumber near me', quote: 'Available for emergency plumbing calls evenings and weekends.' },
    ],
    newAreas: [],
    sources: ['gbp', 'reviews'],
    generatedAt: clock.daysAgo(1).toISOString(),
  };
  await db.insert(clientSetup).values({
    clientId: pending, agencyId: ids.agencyId, source: 'staff', lookup: LOOKUP, suggestions, lastChangedBy: ids.users.admin.userId, lastChangedRole: 'agency_admin',
    lastChangedAt: clock.daysAgo(1), createdAt: clock.daysAgo(1),
  });

  // 11b: the owner was already invited from the wizard — a pending invitation plus the inactive contact the invite step reads ("Invited … waiting for them to accept").
  const ownerEmail = `cedar-creek-owner@${DEMO_DOMAIN}`;
  await createInvitation(db, { agencyId: ids.agencyId, email: ownerEmail, role: 'client_owner', clientId: pending, invitedBy: ids.users.admin.userId }, clock.daysAgo(1));
  const [invited] = await db.insert(contact).values({ agencyId: ids.agencyId, clientId: pending, role: 'client_owner', email: ownerEmail, name: 'Casey Cedar', active: false }).returning({ id: contact.id });
  await db.update(clientSetup).set({ invitedContactId: invited!.id, invitedBy: ids.users.admin.userId }).where(eq(clientSetup.clientId, pending));

  const [run] = await db.insert(discoveryRun).values({
    agencyId: ids.agencyId, clientId: pending, trigger: 'auto', status: 'done', kept: SETUP_RIVALS.length, startedAt: clock.daysAgo(1), finishedAt: clock.daysAgo(1),
    hidden: { wrong_category: 1, self: 1 },
    progress: { searchesDone: 9, searchesTotal: 9, checksDone: SETUP_RIVALS.length, checksTotal: SETUP_RIVALS.length, hiddenList: [{ name: 'Cedar Creek Plumbing', reason: 'self' }] },
  }).returning({ id: discoveryRun.id });
  await db.insert(competitorSuggestion).values(SETUP_RIVALS.map(({ name, candidate }, i) => {
    const c = CANDIDATES[candidate]!;
    return {
      agencyId: ids.agencyId, clientId: pending, name, domain: null, placeId: `demo-setup-rival-${i}`, cid: null, rating: c.signals.rating, votes: c.signals.votes,
      appearances: c.signals.presence?.appeared ?? 0, bestRank: c.signals.presence?.bestRank ?? null, overlapScore: c.overlap, status: 'suggested', createdAt: clock.daysAgo(1),
      runId: run!.id, category: 'Plumber', distanceKm: c.signals.distanceKm, overlap: c.overlap, activity: c.activity, tier: c.tier, signals: c.signals, adMatches: [],
    };
  }));
}

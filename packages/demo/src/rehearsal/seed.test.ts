import { fixturePlaceId } from '@cs/collectors';
import { agency, agencyBilling, brief, client, clientCompetitor, clientSetup, competitor, competitorSource, contact, membership, trackedPage } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { listBriefDueClients } from '@cs/engine';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { REHEARSAL_TIMEZONE, type RehearsalManifest } from './manifest';
import { seedRehearsal } from './seed';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

/** Monday 2026-11-09 09:00 Chicago (after the DST change); the window opens Thursday 22:00 local = Friday 04:00 UTC. */
const NOW = new Date('2026-11-09T15:00:00Z');
const THURSDAY_2200 = new Date('2026-11-13T04:00:00Z');
let m: RehearsalManifest;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  m = await seedRehearsal(dbs.service, { agencies: 2, clients: 2, startingPoints: 1, liveClients: 2, now: NOW, database: 'test/test', random: () => 0.42 });
});

describe('seedRehearsal (scaled: 2 agencies x 2 clients + 1 starting point)', () => {
  it('creates the counted agencies, clients, contacts, competitors, pages, sources and past briefs', async () => {
    const agencies = await dbs.owner.select().from(agency).orderBy(agency.name);
    expect(agencies.map((a) => a.name)).toEqual(['Rehearsal Agency 01', 'Rehearsal Agency 02', 'Rehearsal Agency 03']);
    expect(m.agencies.map((a) => a.id).sort()).toEqual(agencies.map((a) => a.id).sort());
    const billing = await dbs.owner.select().from(agencyBilling);
    expect(billing.map((b) => b.state)).toEqual(['pilot', 'pilot', 'pilot']);

    const clients = await dbs.owner.select().from(client);
    expect(clients).toHaveLength(5);
    expect(clients.every((c) => c.status === 'active' && c.timezone === REHEARSAL_TIMEZONE && c.placeId === fixturePlaceId(c.name))).toBe(true);
    expect(m.weeklyClientIds).toHaveLength(4);
    expect(m.startingPointClientIds).toHaveLength(1);
    for (const c of clients.filter((x) => m.weeklyClientIds.includes(x.id))) expect(c.activatedAt!.getTime()).toBe(NOW.getTime() - 35 * 86_400_000);

    // Agency admin + AM per agency (members), one client owner per client; all @example.com.
    const contacts = await dbs.owner.select().from(contact);
    expect(contacts.filter((c) => c.role === 'agency_admin')).toHaveLength(3);
    expect(contacts.filter((c) => c.role === 'account_manager')).toHaveLength(3);
    expect(contacts.filter((c) => c.role === 'client_owner')).toHaveLength(5);
    expect(contacts.every((c) => c.email.endsWith('@example.com'))).toBe(true);
    const admins = await dbs.owner.select().from(membership).where(eq(membership.role, 'agency_admin'));
    expect(admins.map((a) => a.userId).sort()).toEqual(m.agencies.map((a) => a.adminUserId).sort());

    expect(await dbs.owner.select().from(clientCompetitor)).toHaveLength(15);
    const rivals = await dbs.owner.select().from(competitor);
    expect(rivals).toHaveLength(15);
    expect(rivals.every((r) => r.placeId === fixturePlaceId(r.name) && r.googleAdvertiserIds.length === 1)).toBe(true);
    const pages = await dbs.owner.select().from(trackedPage);
    expect(pages).toHaveLength(60);
    expect(pages.every((p) => p.cadence === 'daily' && /^https:\/\/fx[1-5]\.rehearsal\.rivalmonday\.app\/g\d+\/s[1-3]\/(pricing|services|offers)?$/.test(p.url))).toBe(true);
    expect(new Set(pages.map((p) => new URL(p.url).hostname)).size).toBe(5);
    const sources = await dbs.owner.select().from(competitorSource);
    expect(sources).toHaveLength(15 * 5);
    expect(sources.every((s) => s.lastStatus === 'ok' && s.lastRunAt !== null && s.nextDueAt.getTime() > NOW.getTime())).toBe(true);

    const briefs = await dbs.owner.select().from(brief);
    expect(briefs).toHaveLength(4 * 5);
    expect(briefs.every((b) => b.status === 'sent' && m.weeklyClientIds.includes(b.clientId))).toBe(true);
    expect(briefs.filter((b) => b.kind === 'starting_point')).toHaveLength(4);
    // The rehearsal Monday has no brief yet; the latest past one is today's.
    expect(m.deliveryDate).toBe('2026-11-16');
    expect(briefs.map((b) => b.deliveryDate)).not.toContain('2026-11-16');
    expect(briefs.filter((b) => b.deliveryDate === '2026-11-09')).toHaveLength(4);
  });

  it('turns auto-send on for half the weekly clients and picks the live slice among them', async () => {
    const rows = await dbs.owner.select({ id: client.id, auto: client.briefAutoSend }).from(client).where(inArray(client.id, m.weeklyClientIds));
    expect(rows.filter((r) => r.auto)).toHaveLength(2);
    expect(m.liveClientIds).toHaveLength(2);
    expect(m.liveClientIds.every((id) => m.weeklyClientIds.includes(id))).toBe(true);
  });

  it('starts the starting-point clock at seed time for the new clients', async () => {
    const id = m.startingPointClientIds[0]!;
    const [row] = await dbs.owner.select({ activatedAt: client.activatedAt, done: clientSetup.competitorsDoneAt }).from(client).innerJoin(clientSetup, eq(clientSetup.clientId, client.id)).where(eq(client.id, id));
    expect(row!.activatedAt!.toISOString()).toBe(NOW.toISOString());
    expect(row!.done!.toISOString()).toBe(NOW.toISOString());
    expect(await dbs.owner.select().from(brief).where(eq(brief.clientId, id))).toEqual([]);
    expect(await dbs.owner.select().from(clientCompetitor).where(and(eq(clientCompetitor.clientId, id)))).toHaveLength(3);
  });

  it('listBriefDueClients picks every seeded client on Thursday 22:00 local, none before', async () => {
    expect((await listBriefDueClients(dbs.service, THURSDAY_2200)).sort()).toEqual([...m.weeklyClientIds, ...m.startingPointClientIds].sort());
    expect(await listBriefDueClients(dbs.service, new Date(THURSDAY_2200.getTime() - 3_600_000))).toEqual([]);
  });

  it('refuses to seed a second time while rehearsal agencies are live', async () => {
    await expect(seedRehearsal(dbs.service, { agencies: 1, clients: 1, startingPoints: 0, liveClients: 0, now: NOW, database: 'test/test' })).rejects.toThrow(/already seeded/);
  });
});

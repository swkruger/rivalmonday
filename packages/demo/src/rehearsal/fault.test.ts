import { agency, brief, client } from '@cs/db';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { BRIEF_MAX_ATTEMPTS, findReadinessIssues, listBriefDueClients } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { seedFault } from './fault';
import { dbIdentity, guardManifestRun } from './guards';
import { FAULT_AGENCY_NAME, type RehearsalManifest } from './manifest';
import { seedRehearsal } from './seed';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(() => resetDemoTables(dbs.owner));

/** Monday 2026-11-09 09:00 Chicago; window opens Thu 2026-11-12 22:00 local (Fri 04:00 UTC); generation closes Fri 12:00 local. */
const MONDAY = new Date('2026-11-09T15:00:00Z');
const THURSDAY_2200 = new Date('2026-11-13T04:00:00Z');
const FRIDAY_1300 = new Date('2026-11-13T19:00:00Z');
const seedWeekly = () => seedRehearsal(dbs.service, { agencies: 1, clients: 1, startingPoints: 0, liveClients: 0, now: MONDAY, database: dbIdentity(testUrls.service) });

describe('seedFault', () => {
  it('pre-fails the coming Monday brief of 3 clients at max attempts, so they are never generated and the alarm fires', async () => {
    const m = await seedWeekly();
    const f = await seedFault(dbs.service, { clients: 3, now: MONDAY, manifest: m });
    expect(f.deliveryDate).toBe('2026-11-16');
    const [a] = await dbs.owner.select().from(agency).where(eq(agency.id, f.agencyId));
    expect(a!.name).toBe(FAULT_AGENCY_NAME);
    expect(await dbs.owner.select().from(client).where(eq(client.agencyId, f.agencyId))).toHaveLength(3);
    const rows = await dbs.owner.select().from(brief).where(eq(brief.deliveryDate, '2026-11-16'));
    expect(rows).toHaveLength(3);
    expect(rows.every((b) => b.status === 'failed' && b.attempts === BRIEF_MAX_ATTEMPTS && b.kind === 'standard' && f.clientIds.includes(b.clientId))).toBe(true);

    expect(await listBriefDueClients(dbs.service, THURSDAY_2200)).toEqual(m.weeklyClientIds);
    const issues = await findReadinessIssues(dbs.service, FRIDAY_1300);
    const closed = issues.find((i) => i.checkpoint === 'generation_closed');
    expect(closed?.severity).toBe('critical');
    // The weekly client has no brief yet either; the fault clients are all in the alarm.
    expect(f.clientIds.every((id) => closed!.clients.some((c) => c.clientId === id))).toBe(true);
    expect(issues.filter((i) => i.checkpoint === 'starting_point_late')).toEqual([]);
  });

  it('refuses once the brief window has opened (Thursday 22:00 local) and refuses a second fault agency', async () => {
    const m = await seedWeekly();
    await expect(seedFault(dbs.service, { clients: 3, now: THURSDAY_2200, manifest: m })).rejects.toThrow(/before Thursday/);
    await seedFault(dbs.service, { clients: 1, now: MONDAY, manifest: m });
    await expect(seedFault(dbs.service, { clients: 1, now: MONDAY, manifest: m })).rejects.toThrow(/already exists/);
  });

  it('fault refuses an empty database', async () => {
    await expect(seedFault(dbs.service, { clients: 3, now: MONDAY, manifest: { deliveryDate: '2026-11-16' } })).rejects.toThrow(/no live rehearsal agencies/);
    expect(await dbs.owner.select().from(agency)).toEqual([]);
  });

  it('fault refuses a manifest for another database or another week', async () => {
    const m = await seedWeekly();
    const other: RehearsalManifest = { ...m, database: 'ep-prod.neon.tech/neondb' };
    await expect(guardManifestRun(dbs.service, { serviceUrl: testUrls.service, manifest: other, allowTestDatabase: true })).rejects.toThrow(/seeded on ep-prod/);
    await expect(guardManifestRun(dbs.service, { serviceUrl: testUrls.service, manifest: m, allowTestDatabase: true })).resolves.toBeUndefined();
    await expect(seedFault(dbs.service, { clients: 1, now: MONDAY, manifest: { deliveryDate: '2026-11-23' } })).rejects.toThrow(/manifest is for 2026-11-23/);
    // The CLI path (no test override) still refuses the _test database first.
    await expect(guardManifestRun(dbs.service, { serviceUrl: testUrls.service, manifest: m })).rejects.toThrow(/_test/);
  });
});

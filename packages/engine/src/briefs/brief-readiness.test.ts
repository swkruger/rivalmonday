import { brief, client, clientSetup, opsAlert } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { checkBriefReadiness, findReadinessIssues, markOpsAlertEmailed, type ReadinessIssue, weeklyCheckpoint } from './brief-readiness';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const CHI = 'America/Chicago'; // CDT (UTC-5) in October 2026
const at = (iso: string) => new Date(iso);
const FRI_NOON = at('2026-10-23T17:00:00Z'); // Fri 12:00 CDT
const SUN_19 = at('2026-10-26T00:00:00Z'); // Sun 19:00 CDT
const MONDAY = '2026-10-26';
const LONG_AGO = at('2026-01-01T00:00:00Z');
const AGENCY_OF: Record<string, string> = { [IDS.clientA1]: IDS.agencyA, [IDS.clientA2]: IDS.agencyA, [IDS.clientB1]: IDS.agencyB };

describe('weeklyCheckpoint', () => {
  it('Thu 23:00 → null; Fri 11:59 → null', () => {
    expect(weeklyCheckpoint(at('2026-10-23T04:00:00Z'), CHI)).toBeNull();
    expect(weeklyCheckpoint(at('2026-10-23T16:59:00Z'), CHI)).toBeNull();
  });

  it('Fri 12:00 → generation closed, not pre-delivery, window opened Thu 22:00 local', () => {
    expect(weeklyCheckpoint(FRI_NOON, CHI)).toEqual({ deliveryDate: MONDAY, windowOpenedAt: at('2026-10-23T03:00:00Z'), preDelivery: false });
  });

  it('Sun 18:59 is not pre-delivery; Sun 19:00 is', () => {
    expect(weeklyCheckpoint(at('2026-10-25T23:59:00Z'), CHI)).toMatchObject({ deliveryDate: MONDAY, preDelivery: false });
    expect(weeklyCheckpoint(SUN_19, CHI)).toMatchObject({ deliveryDate: MONDAY, preDelivery: true, windowOpenedAt: at('2026-10-23T03:00:00Z') });
  });

  it("Mon 06:59 → today's date, pre-delivery; Mon 07:00 → null", () => {
    expect(weeklyCheckpoint(at('2026-10-26T11:59:00Z'), CHI)).toEqual({ deliveryDate: MONDAY, windowOpenedAt: at('2026-10-23T03:00:00Z'), preDelivery: true });
    expect(weeklyCheckpoint(at('2026-10-26T12:00:00Z'), CHI)).toBeNull();
  });

  it('Pacific/Kiritimati (UTC+14): Fri 12:00 local is Thu 22:00 UTC', () => {
    expect(weeklyCheckpoint(at('2026-10-22T21:59:00Z'), 'Pacific/Kiritimati')).toBeNull();
    expect(weeklyCheckpoint(at('2026-10-22T22:00:00Z'), 'Pacific/Kiritimati')).toEqual({ deliveryDate: MONDAY, windowOpenedAt: at('2026-10-22T08:00:00Z'), preDelivery: false });
  });
});

async function seedBrief(clientId: string, o: Partial<typeof brief.$inferInsert> = {}) {
  await dbs.owner.insert(brief).values({ agencyId: AGENCY_OF[clientId]!, clientId, deliveryDate: MONDAY, periodStart: LONG_AGO, periodEnd: LONG_AGO, status: 'ready', summary: 's', ...o });
}
/** Every seeded client's weekly brief for MONDAY, in `status`. */
async function seedAllReady(status = 'ready') {
  for (const id of Object.keys(AGENCY_OF)) await seedBrief(id, { status });
}
const forClient = (issues: ReadinessIssue[], clientId: string) =>
  issues.filter((i) => i.clients.some((c) => c.clientId === clientId)).map((i) => ({ checkpoint: i.checkpoint, severity: i.severity, deliveryDate: i.deliveryDate }));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ createdAt: LONG_AGO, activatedAt: LONG_AGO });
  // Every client got its starting point long ago (a starting_point issue is opted into per test).
  for (const id of Object.keys(AGENCY_OF)) await seedBrief(id, { kind: 'starting_point', status: 'sent', deliveryDate: '2026-01-05' });
});

describe('findReadinessIssues', () => {
  it('missing brief at Fri 12:00 → generation_closed', async () => {
    await seedBrief(IDS.clientA2);
    await seedBrief(IDS.clientB1, { status: 'approved' });
    const issues = await findReadinessIssues(dbs.service, FRI_NOON);
    expect(issues).toEqual([{
      checkpoint: 'generation_closed', severity: 'critical', deliveryDate: MONDAY, timezone: CHI, dedupeKey: `brief_readiness:generation_closed:${MONDAY}:${CHI}`,
      clients: [{ clientId: IDS.clientA1, clientName: 'A1 HVAC', agencyName: 'Agency A' }],
    }]);
    expect(await findReadinessIssues(dbs.service, at('2026-10-23T16:59:00Z'))).toEqual([]);
  });

  it('generating row past Fri 12:00 → critical', async () => {
    await seedAllReady();
    await dbs.owner.update(brief).set({ status: 'generating' }).where(and(eq(brief.clientId, IDS.clientA1), eq(brief.deliveryDate, MONDAY)));
    expect(forClient(await findReadinessIssues(dbs.service, FRI_NOON), IDS.clientA1)).toEqual([{ checkpoint: 'generation_closed', severity: 'critical', deliveryDate: MONDAY }]);
  });

  it('starting point holding the Monday and ready → no issue', async () => {
    await seedAllReady();
    await dbs.owner.delete(brief).where(eq(brief.clientId, IDS.clientA1));
    await seedBrief(IDS.clientA1, { kind: 'starting_point', status: 'ready' });
    expect(await findReadinessIssues(dbs.service, FRI_NOON)).toEqual([]);
  });

  it('client activated Friday 09:00 → not expected', async () => {
    await dbs.owner.update(client).set({ activatedAt: at('2026-10-23T14:00:00Z') }).where(eq(client.id, IDS.clientA1));
    await seedBrief(IDS.clientA2);
    await seedBrief(IDS.clientB1);
    expect(await findReadinessIssues(dbs.service, FRI_NOON)).toEqual([]);
  });

  it('spend-paused client → not expected', async () => {
    await seedBrief(IDS.clientA2);
    await seedBrief(IDS.clientB1);
    await spendPauseClient(dbs.owner, IDS.clientA1);
    expect(await findReadinessIssues(dbs.service, FRI_NOON)).toEqual([]);
  });

  it('archived/paused/prospect clients and unserviceable agencies ignored', async () => {
    await dbs.owner.delete(brief); // nobody has a brief or a starting point
    await dbs.owner.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await pauseClient(dbs.owner, IDS.clientA2);
    expect((await findReadinessIssues(dbs.service, FRI_NOON)).flatMap((i) => i.clients.map((c) => c.clientId))).toEqual([IDS.clientB1, IDS.clientB1]);
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientB1));
    expect(await findReadinessIssues(dbs.service, FRI_NOON)).toEqual([]);
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientB1));
    await pauseAgency(dbs.owner, IDS.agencyB, 'suspended');
    expect(await findReadinessIssues(dbs.service, FRI_NOON)).toEqual([]);
  });

  it('ready + auto-send off on Sun 19:00 → warning; auto-send on → no issue', async () => {
    await seedAllReady('approved');
    await dbs.owner.update(brief).set({ status: 'ready' }).where(and(eq(brief.clientId, IDS.clientA1), eq(brief.deliveryDate, MONDAY)));
    expect(await findReadinessIssues(dbs.service, SUN_19)).toEqual([{
      checkpoint: 'pre_delivery_unapproved', severity: 'warning', deliveryDate: MONDAY, timezone: CHI, dedupeKey: `brief_readiness:pre_delivery_unapproved:${MONDAY}:${CHI}`,
      clients: [{ clientId: IDS.clientA1, clientName: 'A1 HVAC', agencyName: 'Agency A' }],
    }]);
    expect(await findReadinessIssues(dbs.service, FRI_NOON)).toEqual([]); // ready is fine before Sunday 19:00
    await dbs.owner.update(client).set({ briefAutoSend: true }).where(eq(client.id, IDS.clientA1));
    expect(await findReadinessIssues(dbs.service, SUN_19)).toEqual([]);
  });

  it('failed on Sun 19:00 → pre_delivery critical, not repeated under generation_closed', async () => {
    await seedAllReady('approved');
    await dbs.owner.update(brief).set({ status: 'failed' }).where(and(eq(brief.clientId, IDS.clientA1), eq(brief.deliveryDate, MONDAY)));
    await dbs.owner.delete(brief).where(and(eq(brief.clientId, IDS.clientB1), eq(brief.deliveryDate, MONDAY)));
    const issues = await findReadinessIssues(dbs.service, SUN_19);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ checkpoint: 'pre_delivery', severity: 'critical', dedupeKey: `brief_readiness:pre_delivery:${MONDAY}:${CHI}` });
    expect(issues[0]!.clients.map((c) => c.clientId)).toEqual([IDS.clientA1, IDS.clientB1]);
  });

  it('starting point 54 h after clock start and generating → late', async () => {
    const start = at('2026-10-20T15:00:00Z'); // Tue; checked on Thu afternoon (no weekly checkpoint)
    await dbs.owner.update(client).set({ activatedAt: start }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(brief).set({ status: 'generating' }).where(eq(brief.clientId, IDS.clientA1));
    const late = new Date(start.getTime() + 54 * 3_600_000);
    expect(await findReadinessIssues(dbs.service, new Date(late.getTime() - 60_000))).toEqual([]);
    expect(await findReadinessIssues(dbs.service, late)).toEqual([{
      checkpoint: 'starting_point_late', severity: 'critical', deliveryDate: '2026-10-22', dedupeKey: `brief_readiness:starting_point_late:${IDS.clientA1}`,
      clients: [{ clientId: IDS.clientA1, clientName: 'A1 HVAC', agencyName: 'Agency A' }],
    }]);
  });

  it('starting point due on a local Monday holding the weekly brief is late only from Tuesday 06:00 local', async () => {
    await dbs.owner.delete(brief).where(eq(brief.clientId, IDS.clientA1)); // no starting point yet
    await dbs.owner.update(client).set({ activatedAt: at('2026-10-24T08:00:00Z') }).where(eq(client.id, IDS.clientA1)); // due Mon 03:00 CDT
    const MON_09 = at('2026-10-26T14:00:00Z');
    expect((await findReadinessIssues(dbs.service, MON_09)).map((i) => i.checkpoint)).toEqual(['starting_point_late']); // nothing blocks the claim
    await seedBrief(IDS.clientA1); // the weekly brief holds Monday: the starting point can claim only from Tuesday
    expect(await findReadinessIssues(dbs.service, MON_09)).toEqual([]);
    expect(await findReadinessIssues(dbs.service, at('2026-10-27T10:59:00Z'))).toEqual([]); // Tue 05:59 CDT
    expect(await findReadinessIssues(dbs.service, at('2026-10-27T11:00:00Z'))).toEqual([expect.objectContaining({
      checkpoint: 'starting_point_late', deliveryDate: '2026-10-26', dedupeKey: `brief_readiness:starting_point_late:${IDS.clientA1}`,
    })]);
  });

  it('starting point uses the setup clock; an open setup without competitors is not due', async () => {
    const start = at('2026-10-20T15:00:00Z');
    await dbs.owner.delete(brief).where(eq(brief.clientId, IDS.clientA1));
    await dbs.owner.update(client).set({ activatedAt: at('2026-10-15T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA });
    const now = new Date(start.getTime() + 54 * 3_600_000);
    expect(await findReadinessIssues(dbs.service, now)).toEqual([]);
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: start }).where(eq(clientSetup.clientId, IDS.clientA1));
    expect((await findReadinessIssues(dbs.service, now)).map((i) => i.checkpoint)).toEqual(['starting_point_late']);
  });
});

describe('checkBriefReadiness', () => {
  beforeEach(async () => {
    await seedBrief(IDS.clientA2);
    await seedBrief(IDS.clientB1);
  });

  it('weekly alerts are per time zone: a zone resolved earlier does not swallow a later one', async () => {
    await dbs.owner.update(client).set({ timezone: 'America/New_York' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ timezone: 'America/Los_Angeles' }).where(eq(client.id, IDS.clientB1));
    await dbs.owner.delete(brief).where(and(eq(brief.clientId, IDS.clientB1), eq(brief.deliveryDate, MONDAY)));
    const east = await checkBriefReadiness(dbs.service, at('2026-10-23T16:00:00Z')); // Fri 12:00 EDT; 09:00 PDT
    expect(east.toEmail.map((a) => a.dedupeKey)).toEqual([`brief_readiness:generation_closed:${MONDAY}:America/New_York`]);
    await markOpsAlertEmailed(dbs.service, east.toEmail[0]!.id, at('2026-10-23T16:00:00Z'));
    await seedBrief(IDS.clientA1);
    expect((await checkBriefReadiness(dbs.service, at('2026-10-23T17:00:00Z'))).resolved).toBe(1);
    const west = await checkBriefReadiness(dbs.service, at('2026-10-23T19:00:00Z')); // Fri 12:00 PDT
    expect(west.open.map((a) => a.dedupeKey)).toEqual([`brief_readiness:generation_closed:${MONDAY}:America/Los_Angeles`]);
    expect(west.toEmail).toHaveLength(1);
    expect((west.toEmail[0]!.summary as { clients: { clientId: string }[] }).clients.map((c) => c.clientId)).toEqual([IDS.clientB1]);
  });

  it('second run updates last_seen_at, no second email', async () => {
    const first = await checkBriefReadiness(dbs.service, FRI_NOON);
    expect(first.toEmail).toHaveLength(1);
    expect(first.toEmail[0]).toMatchObject({ kind: 'brief_readiness', severity: 'critical', dedupeKey: `brief_readiness:generation_closed:${MONDAY}:${CHI}`, firstSeenAt: FRI_NOON, lastSeenAt: FRI_NOON, emailedAt: null });
    expect(first.toEmail[0]!.summary).toEqual({ checkpoint: 'generation_closed', deliveryDate: MONDAY, clients: [{ clientId: IDS.clientA1, clientName: 'A1 HVAC', agencyName: 'Agency A' }] });
    await markOpsAlertEmailed(dbs.service, first.toEmail[0]!.id, FRI_NOON);
    const later = new Date(FRI_NOON.getTime() + 3_600_000);
    const second = await checkBriefReadiness(dbs.service, later);
    expect(second.toEmail).toEqual([]);
    expect(second.open).toHaveLength(1);
    expect(second.open[0]).toMatchObject({ id: first.toEmail[0]!.id, firstSeenAt: FRI_NOON, lastSeenAt: later, emailedAt: FRI_NOON, resolvedAt: null });
    expect(second.resolved).toBe(0);
  });

  it('an emailed alert that gains a client is emailed again', async () => {
    const first = await checkBriefReadiness(dbs.service, FRI_NOON);
    await markOpsAlertEmailed(dbs.service, first.toEmail[0]!.id, FRI_NOON);
    await dbs.owner.delete(brief).where(and(eq(brief.clientId, IDS.clientB1), eq(brief.deliveryDate, MONDAY)));
    const later = new Date(FRI_NOON.getTime() + 3_600_000);
    const r = await checkBriefReadiness(dbs.service, later);
    expect(r.toEmail).toHaveLength(1);
    expect(r.toEmail[0]).toMatchObject({ id: first.toEmail[0]!.id, emailedAt: null, firstSeenAt: FRI_NOON, lastSeenAt: later });
    expect((r.toEmail[0]!.summary as { clients: { clientId: string }[] }).clients.map((c) => c.clientId)).toEqual([IDS.clientA1, IDS.clientB1]);
  });

  it('an emailed alert whose set shrinks or is unchanged is not re-emailed', async () => {
    await dbs.owner.delete(brief).where(and(eq(brief.clientId, IDS.clientB1), eq(brief.deliveryDate, MONDAY)));
    const first = await checkBriefReadiness(dbs.service, FRI_NOON);
    expect((first.toEmail[0]!.summary as { clients: unknown[] }).clients).toHaveLength(2);
    await markOpsAlertEmailed(dbs.service, first.toEmail[0]!.id, FRI_NOON);
    const t1 = new Date(FRI_NOON.getTime() + 3_600_000);
    const unchanged = await checkBriefReadiness(dbs.service, t1);
    expect(unchanged.toEmail).toEqual([]);
    await seedBrief(IDS.clientB1);
    const shrunk = await checkBriefReadiness(dbs.service, new Date(t1.getTime() + 3_600_000));
    expect(shrunk.toEmail).toEqual([]);
    expect(shrunk.open).toHaveLength(1);
    expect(shrunk.open[0]).toMatchObject({ emailedAt: FRI_NOON });
    expect((shrunk.open[0]!.summary as { clients: { clientId: string }[] }).clients.map((c) => c.clientId)).toEqual([IDS.clientA1]);
  });

  it('not yet emailed stays in toEmail on the next run', async () => {
    await checkBriefReadiness(dbs.service, FRI_NOON);
    expect((await checkBriefReadiness(dbs.service, new Date(FRI_NOON.getTime() + 3_600_000))).toEmail).toHaveLength(1);
  });

  it('cleared issue gets resolved_at', async () => {
    await checkBriefReadiness(dbs.service, FRI_NOON);
    await seedBrief(IDS.clientA1);
    const later = new Date(FRI_NOON.getTime() + 3_600_000);
    const r = await checkBriefReadiness(dbs.service, later);
    expect(r).toEqual({ open: [], toEmail: [], resolved: 1 });
    const [row] = await dbs.service.select().from(opsAlert);
    expect(row!.resolvedAt).toEqual(later);
  });

  it('resolved key never re-emails', async () => {
    await checkBriefReadiness(dbs.service, FRI_NOON);
    await seedBrief(IDS.clientA1);
    const t1 = new Date(FRI_NOON.getTime() + 3_600_000);
    await checkBriefReadiness(dbs.service, t1); // resolved
    await dbs.owner.update(brief).set({ status: 'failed' }).where(and(eq(brief.clientId, IDS.clientA1), eq(brief.deliveryDate, MONDAY)));
    const r = await checkBriefReadiness(dbs.service, new Date(t1.getTime() + 3_600_000));
    expect(r).toEqual({ open: [], toEmail: [], resolved: 0 });
    const rows = await dbs.service.select().from(opsAlert);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ resolvedAt: t1, lastSeenAt: FRI_NOON });
  });
});

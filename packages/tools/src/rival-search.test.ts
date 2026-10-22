import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyBilling, client, discoveryRun, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, ToolDeps } from './deps';
import { createToolRegistry } from './registry';
import { listMonthlyRivalClients, manualSearchWeek, nextManualSearchAt, searchDayLabel, startCompetitorSearch } from './rival-search';

const STD_PLAN = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 10, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const deps: ToolDeps = { app: dbs.app, service: dbs.service, enqueue };
const registry = createToolRegistry(deps, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const PROFILE = { keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJa1hvacplace1' };
const MIN = 60_000;
const DAY = 86_400_000;

const runs = (clientId: string) => dbs.owner.select().from(discoveryRun).where(eq(discoveryRun.clientId, clientId));
type Trigger = 'auto' | 'manual' | 'convert' | 'scheduled';
async function pastRun(clientId: string, opts: { status?: 'done' | 'failed'; startedAgoMs?: number; finishedAgoMs?: number | null; trigger?: Trigger; startedAt?: Date; searchesDone?: number } = {}): Promise<string> {
  const now = Date.now();
  const startedAt = opts.startedAt ?? new Date(now - (opts.startedAgoMs ?? 0));
  const [r] = await dbs.owner.insert(discoveryRun).values({
    agencyId: IDS.agencyA, clientId, trigger: opts.trigger ?? 'manual', status: opts.status ?? 'failed',
    startedAt, finishedAt: opts.finishedAgoMs === null ? null : opts.startedAt ? startedAt : new Date(now - (opts.finishedAgoMs ?? 0)),
    progress: opts.searchesDone === undefined ? {} : { searchesDone: opts.searchesDone },
  }).returning({ id: discoveryRun.id });
  return r!.id;
}

beforeEach(async () => {
  enqueue.mockReset();
  enqueue.mockResolvedValue(undefined);
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(plan).values(STD_PLAN); // 9a: create_client/convert_prospect check the seat cap, which needs a current plan
});

const agencyState = async (state: 'read_only' | 'suspended') => {
  const [p] = await dbs.owner.select({ id: plan.id }).from(plan).limit(1);
  await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state, planId: p!.id })
    .onConflictDoUpdate({ target: agencyBilling.agencyId, set: { state } });
};
const pause = (clientId: string, pausedAt: Date | null = new Date()) => dbs.owner.update(client).set({ pausedAt }).where(eq(client.id, clientId));

describe('startCompetitorSearch', () => {
  it('missing place id → missing_profile', async () => {
    await dbs.owner.update(client).set({ keywords: PROFILE.keywords, serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ refused: 'missing_profile' });
    expect(await runs(IDS.clientA1)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('an archived client is not_found and nothing is written (7a2 D16)', async () => {
    await dbs.owner.update(client).set({ ...PROFILE, archivedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'auto')).rejects.toMatchObject({ code: 'not_found' });
    expect(await runs(IDS.clientA1)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('inserts a queued run and enqueues rival-search under the client singleton', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    const r = await startCompetitorSearch(deps, IDS.clientA1, 'manual');
    expect(r).toEqual({ runId: expect.any(String) });
    const [run] = await runs(IDS.clientA1);
    expect(run).toMatchObject({ id: (r as { runId: string }).runId, agencyId: IDS.agencyA, status: 'queued', trigger: 'manual' });
    expect(enqueue).toHaveBeenCalledWith('rival-search', { runId: run!.id }, `rival:${IDS.clientA1}`);
  });

  it('one live run per client: a concurrent second start is refused as running', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    const both = await Promise.all([startCompetitorSearch(deps, IDS.clientA1, 'manual'), startCompetitorSearch(deps, IDS.clientA1, 'auto')]);
    expect(both.filter((r) => 'runId' in r)).toHaveLength(1);
    expect(both.filter((r) => 'refused' in r)).toEqual([{ refused: 'running' }]);
    expect(await runs(IDS.clientA1)).toHaveLength(1);
  });

  it('cooldown: automatic runs are refused for 10 minutes after the last run finished; manual runs are not', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    const id = await pastRun(IDS.clientA1, { status: 'done', startedAgoMs: 20 * MIN, finishedAgoMs: 5 * MIN, trigger: 'auto' });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'scheduled')).resolves.toEqual({ refused: 'cooldown' });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ runId: expect.any(String) });
    await dbs.owner.delete(discoveryRun).where(eq(discoveryRun.trigger, 'manual'));
    await dbs.owner.update(discoveryRun).set({ finishedAt: new Date(Date.now() - 11 * MIN) }).where(eq(discoveryRun.id, id));
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'scheduled')).resolves.toEqual({ runId: expect.any(String) });
  });

  it('daily cap: the 6th manual run of the agency today is refused with the decided copy; other triggers neither count nor are capped', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    // Four manual runs today for another client, automatic ones that never count, and one manual run 9 days ago.
    for (let i = 0; i < 4; i++) await pastRun(IDS.clientA2, { finishedAgoMs: 0 });
    for (const trigger of ['auto', 'convert', 'scheduled'] as const) await pastRun(IDS.clientA2, { finishedAgoMs: 0, trigger });
    await pastRun(IDS.clientA1, { startedAgoMs: 9 * DAY, finishedAgoMs: 9 * DAY });
    // Another agency's runs never count.
    await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyB, clientId: IDS.clientB1, trigger: 'manual', status: 'failed', finishedAt: new Date() });
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toEqual({ queued: true, runId: expect.any(String) });
    expect(enqueue).toHaveBeenCalledTimes(1);

    // Five manual runs today now. A1's own manual run moves to last week so only the cap can refuse.
    await dbs.owner.update(discoveryRun).set({ status: 'failed', startedAt: new Date(Date.now() - 8 * DAY), finishedAt: new Date(Date.now() - 8 * DAY) }).where(eq(discoveryRun.clientId, IDS.clientA1));
    await pastRun(IDS.clientA2, { finishedAgoMs: 0 });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ refused: 'daily_cap' });
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input', message: 'Daily search limit reached. Try again tomorrow.' });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'scheduled')).resolves.toEqual({ runId: expect.any(String) });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('a failed enqueue deletes the run (no cooldown, no cap) and is refused as enqueue_failed', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    enqueue.mockRejectedValueOnce(new Error('queue down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ refused: 'enqueue_failed' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/rival-search enqueue failed for run .*queue down/));
    warn.mockRestore();
    expect(await runs(IDS.clientA1)).toEqual([]);
    // Nothing blocks the retry.
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ runId: expect.any(String) });
  });

  it('without a queue it refuses with internal before writing anything', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await expect(startCompetitorSearch({ app: dbs.app, service: dbs.service }, IDS.clientA1, 'manual')).rejects.toMatchObject({ code: 'internal' });
    expect(await runs(IDS.clientA1)).toEqual([]);
  });
});

describe('weekly manual search limit (owner decision 2026-10-15)', () => {
  const CHICAGO = 'America/Chicago';
  // Wed 14 Oct 2026, 10:00 in Chicago (CDT, UTC-5).
  const WED = new Date('2026-10-14T15:00:00Z');
  beforeEach(async () => {
    await dbs.owner.update(client).set({ ...PROFILE, timezone: CHICAGO }).where(eq(client.id, IDS.clientA1));
  });

  it('manualSearchWeek: Monday 00:00 in the client timezone, and the next Monday', () => {
    expect(manualSearchWeek(WED, CHICAGO)).toEqual({ start: new Date('2026-10-12T05:00:00Z'), next: new Date('2026-10-19T05:00:00Z'), nextLocalDate: '2026-10-19' });
    // Sunday 23:30 in Chicago is still the old week although it is Monday in UTC.
    expect(manualSearchWeek(new Date('2026-10-19T04:30:00Z'), CHICAGO).next).toEqual(new Date('2026-10-19T05:00:00Z'));
    expect(manualSearchWeek(new Date('2026-10-19T05:00:00Z'), CHICAGO).start).toEqual(new Date('2026-10-19T05:00:00Z'));
    // Across the US DST change (1 Nov 2026) the next Monday is at UTC-6.
    expect(manualSearchWeek(new Date('2026-10-28T15:00:00Z'), CHICAGO).next).toEqual(new Date('2026-11-02T06:00:00Z'));
    // Tokyo is ahead of UTC: Monday 00:00 JST is Sunday 15:00 UTC.
    expect(manualSearchWeek(WED, 'Asia/Tokyo').start).toEqual(new Date('2026-10-11T15:00:00Z'));
    expect(searchDayLabel('2026-10-19')).toBe('Mon 19 Oct');
    expect(searchDayLabel('2026-11-02')).toBe('Mon 2 Nov');
  });

  it('a second manual search in the same client-local week is refused with the decided copy', async () => {
    await pastRun(IDS.clientA1, { status: 'done', startedAt: new Date('2026-10-12T06:00:00Z') });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual', WED)).resolves.toEqual({ refused: 'weekly_limit', nextManualSearchAt: '2026-10-19T05:00:00.000Z', nextLabel: 'Mon 19 Oct' });
    expect(enqueue).not.toHaveBeenCalled();
    // The tool uses the real clock: a manual run started a minute ago is always this week.
    await dbs.owner.delete(discoveryRun).where(eq(discoveryRun.clientId, IDS.clientA1));
    await pastRun(IDS.clientA1, { status: 'done', startedAgoMs: MIN, finishedAgoMs: MIN });
    const { nextLocalDate } = manualSearchWeek(new Date(), CHICAGO);
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({
      code: 'invalid_input', message: `One competitor search per week. Next search available ${searchDayLabel(nextLocalDate)}.`,
    });
  });

  it('a failed manual run that made no paid search does not use up the week; one that made a search does', async () => {
    await pastRun(IDS.clientA1, { status: 'failed', startedAt: new Date('2026-10-13T12:00:00Z') });
    await pastRun(IDS.clientA1, { status: 'failed', startedAt: new Date('2026-10-13T13:00:00Z'), searchesDone: 0 });
    await expect(nextManualSearchAt(dbs.service, IDS.clientA1, CHICAGO, WED)).resolves.toBeNull();
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual', WED)).resolves.toEqual({ runId: expect.any(String) });
    await dbs.owner.delete(discoveryRun).where(eq(discoveryRun.clientId, IDS.clientA1));
    await pastRun(IDS.clientA1, { status: 'failed', startedAt: new Date('2026-10-13T12:00:00Z'), searchesDone: 1 });
    await expect(nextManualSearchAt(dbs.service, IDS.clientA1, CHICAGO, WED)).resolves.toBe('2026-10-19T05:00:00.000Z');
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual', WED)).resolves.toMatchObject({ refused: 'weekly_limit' });
  });

  it('failed manual runs that searched count; a run from the previous client-local week does not', async () => {
    // Sunday 23:00 in Chicago = Monday 04:00 UTC: last week for this client.
    await pastRun(IDS.clientA1, { status: 'failed', startedAt: new Date('2026-10-19T04:00:00Z'), searchesDone: 12 });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual', new Date('2026-10-19T04:30:00Z'))).resolves.toMatchObject({ refused: 'weekly_limit', nextLabel: 'Mon 19 Oct' });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual', new Date('2026-10-19T05:30:00Z'))).resolves.toEqual({ runId: expect.any(String) });
  });

  it('auto, convert and scheduled runs do not count toward the weekly limit, and manual runs do not block scheduled ones', async () => {
    for (const trigger of ['auto', 'convert', 'scheduled'] as const) await pastRun(IDS.clientA1, { status: 'done', startedAt: new Date('2026-10-13T12:00:00Z'), trigger });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual', WED)).resolves.toEqual({ runId: expect.any(String) });
    await dbs.owner.update(discoveryRun).set({ status: 'done', finishedAt: new Date('2026-10-13T12:00:00Z') }).where(eq(discoveryRun.clientId, IDS.clientA1));
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'scheduled', WED)).resolves.toEqual({ runId: expect.any(String) });
  });

  it('nextManualSearchAt: null without a manual run this week, else next Monday 00:00 in the client timezone', async () => {
    await expect(nextManualSearchAt(dbs.service, IDS.clientA1, CHICAGO, WED)).resolves.toBeNull();
    await pastRun(IDS.clientA1, { status: 'done', startedAt: new Date('2026-10-13T12:00:00Z'), trigger: 'scheduled' });
    await expect(nextManualSearchAt(dbs.service, IDS.clientA1, CHICAGO, WED)).resolves.toBeNull();
    await pastRun(IDS.clientA1, { status: 'done', startedAt: new Date('2026-10-13T12:00:00Z') });
    await expect(nextManualSearchAt(dbs.service, IDS.clientA1, CHICAGO, WED)).resolves.toBe('2026-10-19T05:00:00.000Z');
    await expect(nextManualSearchAt(dbs.service, IDS.clientA1, 'Asia/Tokyo', WED)).resolves.toBe('2026-10-18T15:00:00.000Z');
  });
});

describe('monthly refresh (scheduled trigger)', () => {
  it('listMonthlyRivalClients: active clients with keywords, a service area and a place id only', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJa2hvacplace2', status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(client).set({ keywords: [], serviceArea: AREA, placeId: 'ChIJb1hvacplace1' }).where(eq(client.id, IDS.clientB1));
    expect(await listMonthlyRivalClients(dbs.service)).toEqual([IDS.clientA1]);
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJb1hvacplace1' }).where(eq(client.id, IDS.clientB1));
    expect((await listMonthlyRivalClients(dbs.service)).sort()).toEqual([IDS.clientA1, IDS.clientB1].sort());
  });

  it('a scheduled run can start in the future: its start time is the delayed one', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    const at = new Date(Date.now() + 10 * MIN);
    const r = await startCompetitorSearch(deps, IDS.clientA1, 'scheduled', at);
    expect(r).toEqual({ runId: expect.any(String) });
    expect(await runs(IDS.clientA1)).toEqual([expect.objectContaining({ trigger: 'scheduled', status: 'queued', startedAt: at })]);
  });
});

describe('billing state (9a/9b)', () => {
  const TRIGGERS: Trigger[] = ['manual', 'auto', 'convert', 'scheduled'];

  it('listMonthlyRivalClients skips every client of a read_only or suspended agency; another agency still runs', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJa2hvacplace2' }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJb1hvacplace1' }).where(eq(client.id, IDS.clientB1));
    await agencyState('read_only');
    expect(await listMonthlyRivalClients(dbs.service)).toEqual([IDS.clientB1]);
    await agencyState('suspended');
    expect(await listMonthlyRivalClients(dbs.service)).toEqual([IDS.clientB1]);
  });

  it('listMonthlyRivalClients skips a paused client; its unpaused sibling still runs', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJa2hvacplace2' }).where(eq(client.id, IDS.clientA2));
    await pause(IDS.clientA1);
    expect(await listMonthlyRivalClients(dbs.service)).toEqual([IDS.clientA2]);
  });

  it('a paused client is refused service_paused for every trigger: no run row, nothing queued; its sibling still starts', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJa2hvacplace2' }).where(eq(client.id, IDS.clientA2));
    await pause(IDS.clientA1);
    for (const t of TRIGGERS) await expect(startCompetitorSearch(deps, IDS.clientA1, t)).resolves.toEqual({ refused: 'service_paused' });
    expect(await runs(IDS.clientA1)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
    await expect(startCompetitorSearch(deps, IDS.clientA2, 'scheduled')).resolves.toEqual({ runId: expect.any(String) });
    // The refusals used nothing: once resumed, this week's manual search is still available.
    await pause(IDS.clientA1, null);
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ runId: expect.any(String) });
  });

  it('a read_only or suspended agency is refused service_paused for every trigger; another agency still starts', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ ...PROFILE, placeId: 'ChIJb1hvacplace1' }).where(eq(client.id, IDS.clientB1));
    for (const state of ['read_only', 'suspended'] as const) {
      await agencyState(state);
      for (const t of TRIGGERS) await expect(startCompetitorSearch(deps, IDS.clientA1, t)).resolves.toEqual({ refused: 'service_paused' });
    }
    expect(await runs(IDS.clientA1)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
    await expect(startCompetitorSearch(deps, IDS.clientB1, 'scheduled')).resolves.toEqual({ runId: expect.any(String) });
  });

  it('request_competitor_suggestions on a paused client refuses with the paused copy', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    await pause(IDS.clientA1);
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input', message: 'This client is paused. Resume it to search for competitors.' });
    expect(await runs(IDS.clientA1)).toEqual([]);
  });
});

describe('auto-run hooks (D4)', () => {
  const create = (placeId: string | null, status: 'active' | 'prospect' = 'active') =>
    registry.invoke(admin, 'create_client', { name: 'New HVAC', verticalId: 'hvac_plumbing', services: [], keywords: ['ac repair'], serviceArea: AREA, placeId, status }) as Promise<{ clientId: string }>;

  it('create_client starts an auto run only when keywords, area and place id are all present (active or prospect)', async () => {
    const { clientId: noPlace } = await create(null);
    expect(await runs(noPlace)).toEqual([]);
    const { clientId: active } = await create('ChIJnewactive01');
    expect(await runs(active)).toEqual([expect.objectContaining({ trigger: 'auto', status: 'queued' })]);
    const { clientId: prospect } = await create('ChIJnewprospect1', 'prospect');
    expect(await runs(prospect)).toEqual([expect.objectContaining({ trigger: 'auto' })]);
  });

  it('create_client stays silent when the run cannot start (queue down as in DEMO/TEST, or no queue configured)', async () => {
    enqueue.mockRejectedValueOnce(new Error('queue down'));
    const { clientId } = await create('ChIJqueuedown001');
    expect(await runs(clientId)).toEqual([]);
    const bare = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
    const r = (await bare.invoke(admin, 'create_client', { name: 'No Queue', verticalId: 'hvac_plumbing', services: [], keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJnoqueue00001' })) as { clientId: string };
    expect(await runs(r.clientId)).toEqual([]);
  });

  it('update_client_profile auto-runs only the first time the profile becomes complete (owner decision 2026-10-15)', async () => {
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, keywords: ['ac repair'], serviceArea: AREA });
    expect(await runs(IDS.clientA1)).toEqual([]);
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, placeId: 'ChIJa1hvacplace1' });
    expect(await runs(IDS.clientA1)).toEqual([expect.objectContaining({ trigger: 'auto' })]);
    await dbs.owner.update(discoveryRun).set({ status: 'done', finishedAt: new Date(Date.now() - 20 * MIN) }).where(eq(discoveryRun.clientId, IDS.clientA1));
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, name: 'A1 HVAC Renamed' });
    expect(await runs(IDS.clientA1)).toHaveLength(1);
    // Later keyword / service-area / place-id edits never auto-start (the manual "Find competitors" does).
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, keywords: ['ac repair', 'furnace repair'] });
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, serviceArea: { ...AREA, radiusKm: 20 } });
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, placeId: 'ChIJa1hvacplace2' });
    expect(await runs(IDS.clientA1)).toHaveLength(1);
  });

  it('any earlier run (even a failed manual one) means the profile edit does not auto-start', async () => {
    await pastRun(IDS.clientA1, { status: 'failed', startedAgoMs: 3 * DAY, finishedAgoMs: 3 * DAY });
    await registry.invoke(admin, 'update_client_profile', { clientId: IDS.clientA1, ...PROFILE });
    expect(await runs(IDS.clientA1)).toHaveLength(1);
    expect(enqueue).not.toHaveBeenCalledWith('rival-search', expect.anything(), expect.anything());
  });

  it('convert reuses a 10-day-old run', async () => {
    await dbs.owner.update(client).set({ ...PROFILE, status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await pastRun(IDS.clientA2, { status: 'done', startedAgoMs: 10 * DAY, finishedAgoMs: 10 * DAY });
    await registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 });
    expect(await runs(IDS.clientA2)).toHaveLength(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('convert starts a convert run when the last run is older than 30 days', async () => {
    await dbs.owner.update(client).set({ ...PROFILE, status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await pastRun(IDS.clientA2, { status: 'done', startedAgoMs: 40 * DAY, finishedAgoMs: 40 * DAY });
    await registry.invoke(admin, 'convert_prospect', { clientId: IDS.clientA2 });
    expect((await runs(IDS.clientA2)).map((r) => r.trigger).sort()).toEqual(['convert', 'manual']);
    expect(enqueue).toHaveBeenCalledWith('rival-search', expect.any(Object), `rival:${IDS.clientA2}`);
  });
});

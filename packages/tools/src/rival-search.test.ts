import { type AccessContext, createAccessContext } from '@cs/core';
import { client, discoveryRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, ToolDeps } from './deps';
import { createToolRegistry } from './registry';
import { startCompetitorSearch } from './rival-search';

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
async function pastRun(clientId: string, opts: { status?: 'done' | 'failed'; startedAgoMs?: number; finishedAgoMs?: number | null } = {}): Promise<string> {
  const now = Date.now();
  const [r] = await dbs.owner.insert(discoveryRun).values({
    agencyId: IDS.agencyA, clientId, trigger: 'manual', status: opts.status ?? 'failed',
    startedAt: new Date(now - (opts.startedAgoMs ?? 0)), finishedAt: opts.finishedAgoMs === null ? null : new Date(now - (opts.finishedAgoMs ?? 0)),
  }).returning({ id: discoveryRun.id });
  return r!.id;
}

beforeEach(async () => {
  enqueue.mockReset();
  enqueue.mockResolvedValue(undefined);
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('startCompetitorSearch', () => {
  it('missing place id → missing_profile', async () => {
    await dbs.owner.update(client).set({ keywords: PROFILE.keywords, serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ refused: 'missing_profile' });
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

  it('cooldown: refused for 10 minutes after the last run finished', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    const id = await pastRun(IDS.clientA1, { status: 'done', startedAgoMs: 20 * MIN, finishedAgoMs: 5 * MIN });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ refused: 'cooldown' });
    await dbs.owner.update(discoveryRun).set({ finishedAt: new Date(Date.now() - 11 * MIN) }).where(eq(discoveryRun.id, id));
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'manual')).resolves.toEqual({ runId: expect.any(String) });
  });

  it('daily cap refuses the 6th run with the decided copy', async () => {
    await dbs.owner.update(client).set(PROFILE).where(eq(client.id, IDS.clientA1));
    // Four of agency A's runs today (another client, so no cooldown) plus one two days ago: the next is the 5th today.
    for (let i = 0; i < 4; i++) await pastRun(IDS.clientA2, { finishedAgoMs: 0 });
    await pastRun(IDS.clientA1, { startedAgoMs: 2 * DAY, finishedAgoMs: 2 * DAY });
    // Another agency's runs never count.
    await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyB, clientId: IDS.clientB1, trigger: 'manual', status: 'failed', finishedAt: new Date() });
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).resolves.toEqual({ queued: true, runId: expect.any(String) });

    await dbs.owner.update(discoveryRun).set({ status: 'failed', finishedAt: new Date(Date.now() - 11 * MIN) }).where(eq(discoveryRun.clientId, IDS.clientA1));
    await expect(registry.invoke(admin, 'request_competitor_suggestions', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'invalid_input', message: 'Daily search limit reached. Try again tomorrow.' });
    await expect(startCompetitorSearch(deps, IDS.clientA1, 'auto')).resolves.toEqual({ refused: 'daily_cap' });
    expect(enqueue).toHaveBeenCalledTimes(1);
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
    expect(enqueue).not.toHaveBeenCalled();
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

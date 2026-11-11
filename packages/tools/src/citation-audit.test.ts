import { type AccessContext, createAccessContext, type Feature } from '@cs/core';
import { citationAuditRun, client, clientCompetitor, competitor } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { citationAuditAvailability } from './citation-audit';
import type { EnqueueJob, ToolDeps } from './deps';
import { CITATION_MANUAL_PER_AGENCY_DAY, CITATION_MANUAL_PER_CLIENT_DAYS } from './limits';
import { createToolRegistry } from './registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const enqueue = vi.fn<EnqueueJob>(async () => {});
const deps: ToolDeps = { app: dbs.app, service: dbs.service, enqueue, vendorsConfigured: true };
const registry = createToolRegistry(deps, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], features: Feature[] = []) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features });
const admin = ctx('agency_admin', 'all');
const DAY = 86_400_000;
const SELF = '00000000-0000-4000-8000-0000000000f6';
const RIVAL = '00000000-0000-4000-8000-0000000000f3';
type Res = { runId: string } | { refused: string; nextAvailableAt?: string };

const runs = (clientId = IDS.clientA1) => dbs.owner.select().from(citationAuditRun).where(eq(citationAuditRun.clientId, clientId));
const manualRun = (status: 'done' | 'capped' | 'failed' | 'running', startedAt: Date, clientId = IDS.clientA1, calls = 0) =>
  dbs.owner.insert(citationAuditRun).values({ agencyId: IDS.agencyA, clientId, trigger: 'manual', status, competitorIds: [], startedAt, calls, finishedAt: status === 'running' ? null : startedAt });
const call = (c = admin, clientId: string = IDS.clientA1) => registry.invoke(c, 'request_citation_audit', { clientId }) as Promise<Res>;

beforeEach(async () => {
  enqueue.mockReset();
  enqueue.mockResolvedValue(undefined);
  deps.vendorsConfigured = true;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(competitor).values([{ id: SELF, name: 'Self Co' }, { id: RIVAL, name: 'Rival Co' }]);
  await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: RIVAL });
  await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
});

describe('request_citation_audit', () => {
  it('available: inserts a running manual run and queues the job with its runId', async () => {
    const r = await call();
    const [row] = await runs();
    expect(r).toEqual({ runId: row!.id });
    expect(row).toMatchObject({ trigger: 'manual', status: 'running', agencyId: IDS.agencyA });
    expect(row!.competitorIds[0]).toBe(SELF);
    expect(row!.competitorIds).toContain(RIVAL);
    expect(enqueue).toHaveBeenCalledWith('citation-audit-client', { clientId: IDS.clientA1, runId: row!.id }, `citation-manual:${row!.id}`);
  });

  it('a second request within 7 days: weekly_limit with nextAvailableAt', async () => {
    const at = new Date(Date.now() - 2 * DAY);
    await manualRun('done', at);
    expect(await call()).toEqual({ refused: 'weekly_limit', nextAvailableAt: new Date(at.getTime() + CITATION_MANUAL_PER_CLIENT_DAYS * DAY).toISOString() });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a failed manual run does not count', async () => {
    await manualRun('failed', new Date(Date.now() - 1 * DAY));
    expect(await call()).toMatchObject({ runId: expect.any(String) });
  });

  it('a capped run with no searches (calls = 0) does not block; one that made searches does', async () => {
    await manualRun('capped', new Date(Date.now() - 1 * DAY), IDS.clientA1, 0);
    expect(await call()).toMatchObject({ runId: expect.any(String) });
    await dbs.owner.delete(citationAuditRun);
    await manualRun('capped', new Date(Date.now() - 1 * DAY), IDS.clientA1, 3);
    expect(await call()).toMatchObject({ refused: 'weekly_limit' });
  });

  it('agency daily limit: zero-search capped runs are not counted', async () => {
    const dayStart = new Date('2026-11-10T00:00:00Z');
    const fill = (calls: number) => dbs.owner.insert(citationAuditRun).values(Array.from({ length: CITATION_MANUAL_PER_AGENCY_DAY }, () => ({
      agencyId: IDS.agencyA, clientId: IDS.clientA2, trigger: 'manual' as const, status: 'capped' as const, competitorIds: [], calls, startedAt: new Date(dayStart.getTime() + 1000),
    })));
    const NOW = new Date('2026-11-10T12:00:00Z');
    await fill(0);
    expect(await citationAuditAvailability(dbs.service, { id: IDS.clientA1, agencyId: IDS.agencyA }, NOW, { vendorsConfigured: true })).toEqual({ state: 'available' });
    await dbs.owner.delete(citationAuditRun);
    await fill(2);
    expect((await citationAuditAvailability(dbs.service, { id: IDS.clientA1, agencyId: IDS.agencyA }, NOW, { vendorsConfigured: true })).state).toBe('agency_daily_limit');
  });

  it('not_ready: vendors not configured', async () => {
    deps.vendorsConfigured = false;
    expect(await call()).toEqual({ refused: 'not_ready' });
    expect(await runs()).toHaveLength(0);
  });

  it('not_ready: no own business and no rivals', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: null }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.delete(clientCompetitor);
    expect(await call()).toEqual({ refused: 'not_ready' });
  });

  it('not_ready: no own business, even with rivals', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: null }).where(eq(client.id, IDS.clientA1));
    expect(await call()).toEqual({ refused: 'not_ready' });
    expect(await runs()).toHaveLength(0);
  });

  it('concurrent requests start exactly one run', async () => {
    const rs = await Promise.all([call(), call(), call()]);
    expect(rs.filter((r) => 'runId' in r)).toHaveLength(1);
    expect(rs.filter((r) => !('runId' in r))).toEqual([{ refused: 'running' }, { refused: 'running' }]);
    expect(await runs()).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('a failed enqueue deletes the run row and throws internal', async () => {
    enqueue.mockRejectedValue(new Error('boss down'));
    await expect(call()).rejects.toMatchObject({ code: 'internal' });
    expect(await runs()).toHaveLength(0);
  });

  it('client roles are refused; another agency\'s client is not_found', async () => {
    await expect(call(ctx('client_owner', [IDS.clientA1], ['dashboard']))).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(admin, IDS.clientB1)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('citationAuditAvailability', () => {
  const NOW = new Date('2026-11-10T12:00:00Z');
  const c = { id: IDS.clientA1, agencyId: IDS.agencyA };
  const avail = (vendorsConfigured = true) => citationAuditAvailability(dbs.service, c, NOW, { vendorsConfigured });

  it('available with no history', async () => {
    expect(await avail()).toEqual({ state: 'available' });
  });

  it('a manual run started exactly 7 days ago no longer blocks (strict >)', async () => {
    await manualRun('done', new Date(NOW.getTime() - CITATION_MANUAL_PER_CLIENT_DAYS * DAY));
    expect(await avail()).toEqual({ state: 'available' });
    await dbs.owner.update(citationAuditRun).set({ startedAt: new Date(NOW.getTime() - CITATION_MANUAL_PER_CLIENT_DAYS * DAY + 1000) });
    expect(await avail()).toEqual({ state: 'weekly_limit', nextAvailableAt: new Date(NOW.getTime() + 1000).toISOString() });
  });

  it('weekly and daily limits both hit: weekly_limit wins, every time', async () => {
    const dayStart = new Date('2026-11-10T00:00:00Z');
    await manualRun('done', new Date(dayStart.getTime() + 1000));
    await dbs.owner.insert(citationAuditRun).values(Array.from({ length: CITATION_MANUAL_PER_AGENCY_DAY }, () => ({
      agencyId: IDS.agencyA, clientId: IDS.clientA2, trigger: 'manual' as const, status: 'done' as const, competitorIds: [], startedAt: new Date(dayStart.getTime() + 1000),
    })));
    const first = await avail();
    expect(first.state).toBe('weekly_limit');
    expect(await avail()).toEqual(first);
  });

  it('a running row older than 3 h is not running', async () => {
    await dbs.owner.insert(citationAuditRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'monthly', status: 'running', competitorIds: [], startedAt: new Date(NOW.getTime() - 4 * 3_600_000) });
    expect(await avail()).toEqual({ state: 'available' });
  });

  it('vendors not configured: not_ready', async () => {
    expect(await avail(false)).toEqual({ state: 'not_ready' });
  });
});

import { type AccessContext, createAccessContext } from '@cs/core';
import { client, llmCall, platformAdmin, readAiGuardState, readSpendGuardSettings, spendGuardEvent, writeAiGuardState } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { runSpendGuard } from '../spend-guard';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: [] }, { audit: { record: async () => {} } });
const base = createAccessContext({ agencyId: IDS.agencyA, userId: 'x', role: 'agency_admin', clientScope: 'all', features: [] });
const as = (userId: string) => ({ ...base, userId }) as AccessContext;
const pOwner = as('powner');
const staff = as('staff');
const viewer = as('pviewer');
const tenant = as('tenant-admin');
const call = (c: AccessContext, tool: string, input: unknown = {}) => registry.invoke(c, tool, input) as Promise<any>;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  for (const u of ['powner', 'staff', 'pviewer', 'tenant-admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'powner', role: 'owner', createdBy: 'test' },
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'pviewer', role: 'viewer', createdBy: 'test' },
  ]);
});

describe('spend guard tools', () => {
  it('viewer reads get_spend_guard but cannot reset', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date('2026-10-02T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 20, latencyMs: 1, ok: true });
    const r = await call(viewer, 'get_spend_guard');
    expect(r.settings.spikePausePercent).toBe(200);
    expect(r.state).toEqual({ state: 'ok' });
    expect(r.scopes.map((s: { scope: string }) => s.scope)).toEqual(['total', 'openrouter', 'anthropic']);
    expect(r.pausedClients).toMatchObject([{ clientId: IDS.clientA1, clientName: 'A1 HVAC', agencyId: IDS.agencyA, agencyName: 'Agency A', spendUsd: 20, limitUsd: 15 }]);
    expect(await call(viewer, 'get_ai_guard_state')).toEqual({ state: 'ok' });
    await expect(call(viewer, 'reset_ai_pause', { note: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(tenant, 'get_spend_guard')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reset_ai_pause: ok, snoozed, event with actor and note; note > 200 chars refused', async () => {
    await writeAiGuardState(dbs.owner, { state: 'paused', since: '2026-10-14T10:00:00.000Z', scope: 'anthropic', observedUsd: 30, baselineUsd: 5 }, 'system');
    await expect(call(staff, 'reset_ai_pause', { note: 'x'.repeat(201) })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(call(staff, 'reset_ai_pause', { note: '   ' })).rejects.toMatchObject({ code: 'invalid_input' });
    const before = Date.now();
    const r = await call(staff, 'reset_ai_pause', { note: 'runaway loop fixed' });
    expect(r).toMatchObject({ state: 'ok', resetBy: 'staff' });
    const until = new Date(r.snoozeUntil).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 24 * 3_600_000);
    expect(until).toBeLessThan(Date.now() + 24 * 3_600_000 + 1);
    expect(await readAiGuardState(dbs.service)).toEqual(r);
    const [ev] = await dbs.owner.select().from(spendGuardEvent).where(eq(spendGuardEvent.kind, 'spike_reset'));
    expect(ev).toMatchObject({ actor: 'staff', note: 'runaway loop fixed', scope: 'anthropic' });
    const detail = await call(staff, 'get_spend_guard');
    expect(detail.events[0]).toMatchObject({ kind: 'spike_reset', note: 'runaway loop fixed' });
  });

  it('reset_ai_pause from ok is refused (nothing to reset)', async () => {
    await expect(call(staff, 'reset_ai_pause', { note: 'x' })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await readAiGuardState(dbs.service)).toEqual({ state: 'ok' });
    expect(await dbs.owner.select().from(spendGuardEvent)).toHaveLength(0);
  });

  it('update_spend_guard_settings: staff refused, owner merges, invalid merge (pause <= warn) refused', async () => {
    await expect(call(staff, 'update_spend_guard_settings', { spikeWarnPercent: 120 })).rejects.toMatchObject({ code: 'not_found' });
    const r = await call(pOwner, 'update_spend_guard_settings', { spikeWarnPercent: 120, clientMonthlyLimitUsd: 20 });
    expect(r).toMatchObject({ spikeWarnPercent: 120, clientMonthlyLimitUsd: 20, spikePausePercent: 200, creditsPerUsd: 100 });
    expect(await readSpendGuardSettings(dbs.service)).toEqual(r);
    await call(pOwner, 'update_spend_guard_settings', { spikeSnoozeHours: 12 }); // earlier keys survive a later partial
    expect(await readSpendGuardSettings(dbs.service)).toMatchObject({ spikeWarnPercent: 120, clientMonthlyLimitUsd: 20, spikeSnoozeHours: 12 });
    await expect(call(pOwner, 'update_spend_guard_settings', { spikeWarnPercent: 200 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(call(pOwner, 'update_spend_guard_settings', { spikePausePercent: 100 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(call(pOwner, 'update_spend_guard_settings', {})).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await readSpendGuardSettings(dbs.service)).spikeWarnPercent).toBe(120);
  });

  it('reset then a +250 % reading gives warn, not paused', async () => {
    const recent = new Date(Date.now() - 2 * 3_600_000);
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: null, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 17.5, latencyMs: 1, ok: true, createdAt: recent });
    await writeAiGuardState(dbs.owner, { state: 'paused', since: recent.toISOString(), scope: 'total' }, 'system');
    await call(staff, 'reset_ai_pause', { note: 'ok now' });
    const sent: string[] = [];
    const out = await runSpendGuard({ service: dbs.service, appUrl: 'https://x.test', platformAdmins: ['a@x.test'], sendStaffEmail: async (_to, p) => void sent.push(p.kind) }, new Date());
    expect(out.spike).toBe('warn');
    expect([...new Set(sent)]).toEqual(['spike_warn']); // one alert, sent to each operator
  });
});

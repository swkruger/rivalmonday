import { agencyDailyStat, billingNotice, client, llmCall, platformAdmin, platformSetting, readAiGuardState, SpendGuardSettings, spendGuardEvent, vendorCall, writeAiGuardState } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type PlatformSpendAlertPayload, readSpikes, runSpendGuard, type SpendGuardDeps } from './spend-guard';


const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-14T12:00:00Z');
let staff: { to: string; p: PlatformSpendAlertPayload }[] = [];
const deps = (over: Partial<SpendGuardDeps> = {}): SpendGuardDeps => ({
  service: dbs.service,
  appUrl: 'https://app.rm.test/',
  platformAdmins: ['env-owner@rm.test'],
  sendStaffEmail: async (to, p) => void staff.push({ to, p }),
  ...over,
});
const spend = (clientId: string, costUsd: number, createdAt = NOW) =>
  dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true, createdAt });
const events = (kind?: string) => dbs.owner.select().from(spendGuardEvent).then((r) => (kind ? r.filter((e) => e.kind === kind) : r));
const notices = () => dbs.owner.select().from(billingNotice);
const clientRow = async (id: string) => (await dbs.owner.select().from(client).where(eq(client.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  staff = [];
});

describe('runSpendGuard: client part', () => {
  it('reached once per month', async () => {
    await spend(IDS.clientA1, 16); // limit 15, threshold 19.5
    const a = await runSpendGuard(deps(), NOW);
    const b = await runSpendGuard(deps(), NOW);
    expect(a).toMatchObject({ reached: 1, paused: 0 });
    expect(b).toMatchObject({ reached: 0, paused: 0 });
    expect(await events('client_reached')).toHaveLength(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
    expect(await notices()).toHaveLength(0);
  });

  it('a client over its limit through Jev spend alone is paused', async () => {
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'jev', model: 'jev-1.14', inputTokens: 1, outputTokens: 1, costUsd: 20, latencyMs: 1, ok: true, createdAt: NOW });
    const out = await runSpendGuard(deps(), NOW);
    expect(out).toMatchObject({ reached: 1, paused: 1 });
    expect((await clientRow(IDS.clientA1)).spendPausedAt).not.toBeNull();
  });

  it('paused at 130 %: event, notice, staff email, spend_paused_at', async () => {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('po', 'po', 'Owner@rm.test', true)`);
    await dbs.owner.insert(platformAdmin).values({ userId: 'po', role: 'owner' });
    await spend(IDS.clientA1, 20);
    const out = await runSpendGuard(deps(), NOW);
    expect(out).toMatchObject({ reached: 1, paused: 1, lifted: 0, rolledOver: 0, spike: 'ok' });
    const [ev] = await events('client_paused');
    expect(ev).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, month: '2026-10-01', actor: 'system' });
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toEqual(NOW);
    const [n] = await notices();
    expect(n).toMatchObject({ audience: 'agency', kind: 'client_spend_paused', clientId: IDS.clientA1, agencyId: IDS.agencyA, dedupeKey: `spend_paused:${IDS.clientA1}:2026-10` });
    expect(n!.params).toEqual({ clientName: 'A1 HVAC', until: 'November 1' });
    expect(staff.map((s) => s.to).sort()).toEqual(['env-owner@rm.test', 'owner@rm.test']);
    expect(staff[0]!.p).toMatchObject({
      kind: 'client_paused',
      title: 'A1 HVAC (Agency A) paused for spend',
      url: `https://app.rm.test/platform/agencies/${IDS.agencyA}`,
    });
    expect(staff[0]!.p.lines[0]).toBe('A1 HVAC used $20.00 of its $15.00 limit this month (pause at 130 %). Raise the limit on the agency page or it lifts on November 1.');
  });

  it('second run: no new event/notice/email', async () => {
    await spend(IDS.clientA1, 20);
    await runSpendGuard(deps(), NOW);
    staff = [];
    const out = await runSpendGuard(deps(), NOW);
    expect(out).toMatchObject({ reached: 0, paused: 0, lifted: 0 });
    expect(await events()).toHaveLength(2);
    expect(await notices()).toHaveLength(1);
    expect(staff).toHaveLength(0);
  });

  it('two concurrent runs: one event, one notice', async () => {
    await spend(IDS.clientA1, 20);
    const outs = await Promise.all([runSpendGuard(deps(), NOW), runSpendGuard(deps(), NOW)]);
    expect(await events('client_paused')).toHaveLength(1);
    expect(await events('client_reached')).toHaveLength(1);
    expect(await notices()).toHaveLength(1);
    expect(staff.length).toBe(1); // only the env owner
    expect(outs.reduce((a, o) => a + o.paused, 0)).toBe(1);
  });

  it('a failing staff email never fails the run or loses the pause', async () => {
    await spend(IDS.clientA1, 20);
    const out = await runSpendGuard(deps({ sendStaffEmail: async () => { throw new Error('smtp down'); } }), NOW);
    expect(out.paused).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).not.toBeNull();
  });

  it('rollover clears last month’s pause', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date('2026-09-20T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.rolledOver).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
    const [ev] = await events('client_unpaused');
    expect(ev).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, note: 'month rollover', month: '2026-10-01' });
  });

  it('limit raised outside the tool → lifted next run', async () => {
    await spend(IDS.clientA1, 20);
    await runSpendGuard(deps(), NOW);
    await dbs.owner.update(client).set({ spendLimitUsd: 30 }).where(eq(client.id, IDS.clientA1));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.lifted).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
    expect(await events('client_unpaused')).toMatchObject([{ note: 'under threshold', actor: 'system', limitUsd: 30 }]);
  });

  it('rollover also clears the pause of a client archived while paused', async () => {
    await dbs.owner.update(client).set({ spendPausedAt: new Date('2026-09-20T00:00:00Z'), archivedAt: new Date('2026-10-01T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.rolledOver).toBe(1);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
  });

  it('archived clients ignored, prospect guarded', async () => {
    await spend(IDS.clientA1, 20);
    await spend(IDS.clientA2, 20);
    await dbs.owner.update(client).set({ archivedAt: new Date('2026-10-01T00:00:00Z') }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const out = await runSpendGuard(deps(), NOW);
    expect(out.paused).toBe(1);
    expect((await events('client_paused')).map((e) => e.clientId)).toEqual([IDS.clientA2]);
    expect((await clientRow(IDS.clientA1)).spendPausedAt).toBeNull();
  });

  it('paused_at/paused_by unchanged', async () => {
    await spend(IDS.clientA1, 20);
    const before = await clientRow(IDS.clientA1);
    await runSpendGuard(deps(), NOW);
    const after = await clientRow(IDS.clientA1);
    expect([after.pausedAt, after.pausedBy, after.status]).toEqual([before.pausedAt, before.pausedBy, before.status]);
  });

  it('reports the current platform guard state as spike (Task 10 adds the step)', async () => {
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('ok');
  });
});

const H = 3_600_000;
const D = 24 * H;
const DEFAULTS = SpendGuardSettings.parse({});
const plat = (provider: string, costUsd: number, createdAt: Date) =>
  dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: null, task: 't', provider, model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true, createdAt });
const recent = new Date(NOW.getTime() - 2 * H);
const stats = (clientsActive: number, from = new Date('2026-10-06T00:00:00Z'), days = 8) =>
  dbs.owner.insert(agencyDailyStat).values(Array.from({ length: days }, (_, i) => ({ agencyId: IDS.agencyA, day: new Date(from.getTime() + i * D).toISOString().slice(0, 10), clientsActive })));
const scope = async (s: 'total' | 'openrouter' | 'anthropic', settings = DEFAULTS) => (await readSpikes(dbs.service, NOW, settings)).find((r) => r.scope === s)!;

describe('readSpikes', () => {
  it('cold start (< 7 days of stats) uses the floor only', async () => {
    await stats(2, new Date('2026-10-10T00:00:00Z'), 4);
    await plat('openrouter', 100, new Date(NOW.getTime() - 3 * D)); // would inflate a rate if history counted
    await plat('openrouter', 10, recent);
    expect(await scope('total')).toMatchObject({ observedUsd: 10, baselineUsd: 5, ratioPercent: 100, floorOnly: true });
  });

  it('per-client-day floor × N beats the daily floor', async () => {
    await plat('openrouter', 10, recent);
    const r = await scope('total', SpendGuardSettings.parse({ spikeFloorUsdPerClientDay: 4 })); // 3 serviceable clients
    expect(r.baselineUsd).toBe(12);
    expect(r.ratioPercent).toBe(-17);
  });

  it('same-weekday window wins over a lower 7-day rate', async () => {
    await stats(2); // Oct 6..13: full history
    await plat('openrouter', 14, new Date('2026-10-10T12:00:00Z')); // 7-day rate: 14 / 14 client-days = 1
    await plat('openrouter', 20, new Date('2026-10-06T18:00:00Z')); // the 24 h window ending a week ago (Oct 6 12:00 - Oct 7 12:00)
    const r = await scope('total');
    expect(r.baselineUsd).toBe(30); // rate7 = 1, rateW = 20 / 2 = 10; x N = 3 serviceable clients
  });

  it('both floors 0 and no history: ratio 0 (no signal), finite output', async () => {
    const zero = SpendGuardSettings.parse({ spikeFloorUsdPerDay: 0, spikeFloorUsdPerClientDay: 0 });
    await plat('openrouter', 10, recent);
    expect(await scope('total', zero)).toMatchObject({ observedUsd: 10, baselineUsd: 0, ratioPercent: 0 });
    await dbs.owner.delete(llmCall);
    expect(await scope('total', zero)).toMatchObject({ observedUsd: 0, baselineUsd: 0, ratioPercent: 0 });
  });

  it('zero baseline never warns or pauses a run', async () => {
    await dbs.owner.execute(sql`insert into platform_setting (key, value, updated_by) values ('spend_guard_settings', '{"spikeFloorUsdPerDay":0,"spikeFloorUsdPerClientDay":0}'::jsonb, 't')`);
    await plat('openrouter', 10, recent);
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('ok');
    expect(staff).toHaveLength(0);
  });

  it('7 stat rows with 0 active clients: floor only', async () => {
    await stats(0);
    await plat('openrouter', 40, new Date('2026-10-10T12:00:00Z'));
    await plat('openrouter', 10, recent);
    expect(await scope('total')).toMatchObject({ baselineUsd: 5, floorOnly: true });
  });

  it('jev counts in the baseline sums too', async () => {
    await stats(2);
    await plat('jev', 400, new Date('2026-10-10T12:00:00Z'));
    await plat('jev', 400, new Date('2026-10-06T18:00:00Z'));
    const r = await scope('total');
    expect(r.baselineUsd).toBeGreaterThan(5);
  });

  it('before 12:00 UTC the same-weekday midpoint day (8th day back) is still found', async () => {
    await stats(2); // Oct 6..13
    await plat('openrouter', 20, new Date('2026-10-06T12:00:00Z')); // window Oct 6 06:00 - Oct 7 06:00, midpoint day Oct 6
    const early = new Date('2026-10-14T06:00:00Z');
    const r = (await readSpikes(dbs.service, early, DEFAULTS)).find((x) => x.scope === 'total')!;
    expect(r.baselineUsd).toBe(30);
  });

  it('jev counts in observed, vendor_call does not', async () => {
    await plat('jev', 50, recent);
    await dbs.owner.insert(vendorCall).values({ agencyId: IDS.agencyA, clientId: null, vendor: 'v', operation: 'o', units: 1, costUsd: 50, latencyMs: 1, ok: true, createdAt: recent });
    await plat('openrouter', 3, recent);
    expect((await scope('total')).observedUsd).toBe(53);
  });

  it('openrouter scope sums openrouter + llm + jev (Jev is on the OpenRouter bill)', async () => {
    await plat('openrouter', 2, recent);
    await plat('llm', 3, recent);
    await plat('jev', 4, recent);
    await plat('anthropic', 7, recent);
    expect((await scope('openrouter')).observedUsd).toBe(9);
    expect((await scope('anthropic')).observedUsd).toBe(7);
    expect((await scope('total')).observedUsd).toBe(16);
  });

  it('spike excludes sample', async () => {
    await plat('openrouter', 10, recent);
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyB, clientId: IDS.clientB1, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 50, latencyMs: 1, ok: true, createdAt: recent });
    const perClient = SpendGuardSettings.parse({ spikeFloorUsdPerClientDay: 4 });
    expect(await scope('total', perClient)).toMatchObject({ observedUsd: 60, baselineUsd: 12 }); // no sample agency yet: everything counts, N = 3
    await dbs.owner.insert(platformSetting).values({ key: 'sample_agency_id', value: { agencyId: IDS.agencyB }, updatedBy: 't' });
    expect(await scope('total', perClient)).toMatchObject({ observedUsd: 10, baselineUsd: 8 }); // B's spend and its one client left out
  });
});

describe('runSpendGuard: spike guard', () => {
  const state = () => readAiGuardState(dbs.service);

  it('+200 % pauses and emails once', async () => {
    await plat('openrouter', 15, recent); // baseline 5 -> +200 %
    const out = await runSpendGuard(deps(), NOW);
    expect(out.spike).toBe('paused');
    expect(await state()).toMatchObject({ state: 'paused', scope: 'total', observedUsd: 15, baselineUsd: 5, since: NOW.toISOString() });
    expect(await events('spike_paused')).toMatchObject([{ scope: 'total', observedUsd: 15, baselineUsd: 5, actor: 'system' }]);
    expect(staff).toHaveLength(1);
    expect(staff[0]!.p).toMatchObject({ kind: 'spike_paused', url: 'https://app.rm.test/platform/health' });
    expect(staff[0]!.p.lines[0]).toBe('All AI calls are paused after a spend spike (all providers). Queued work is waiting — reset on Health.');
    staff = [];
    await runSpendGuard(deps(), NOW);
    expect(staff).toHaveLength(0);
    expect(await events('spike_paused')).toHaveLength(1);
  });

  it('the spike guard counts a Jev-only jump', async () => {
    await plat('jev', 15, recent); // baseline 5 -> +200 %
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('paused');
    expect(await state()).toMatchObject({ state: 'paused', scope: 'total', observedUsd: 15 });
  });

  it('paused stays paused below threshold', async () => {
    await writeAiGuardState(dbs.owner, { state: 'paused', since: NOW.toISOString(), scope: 'total' }, 'system');
    const out = await runSpendGuard(deps(), NOW);
    expect(out.spike).toBe('paused');
    expect((await state()).state).toBe('paused');
    expect(await events()).toHaveLength(0);
  });

  it('warn emails only on entry, and a quiet run returns to ok', async () => {
    await plat('anthropic', 10, recent); // +100 %
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('warn');
    expect(staff).toHaveLength(1);
    expect(staff[0]!.p.kind).toBe('spike_warn');
    expect(staff[0]!.p.lines[0]).toBe('AI spend is 100% above normal (all providers).');
    await runSpendGuard(deps(), NOW);
    expect(staff).toHaveLength(1);
    expect(await events('spike_warn')).toHaveLength(1);
    await dbs.owner.delete(llmCall);
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('ok');
    expect(await events('spike_warn')).toHaveLength(1);
  });

  it('a snoozed pause-level reading gives warn, not paused', async () => {
    await writeAiGuardState(dbs.owner, { state: 'ok', snoozeUntil: new Date(NOW.getTime() + 5 * H).toISOString() }, 'system');
    await plat('openrouter', 17.5, recent); // +250 %
    expect((await runSpendGuard(deps(), NOW)).spike).toBe('warn');
    expect(await state()).toMatchObject({ state: 'warn', snoozeUntil: new Date(NOW.getTime() + 5 * H).toISOString() });
    expect(await events('spike_paused')).toHaveLength(0);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { AiPausedError } from '@cs/core';
import { client, platformSetting, spendGuardEvent, withTenant } from './index';
import {
  AI_GUARD_STATE_KEY,
  createAiGuard,
  effectiveLimitUsd,
  pauseThresholdUsd,
  readAiGuardState,
  readSpendGuardSettings,
  SPEND_GUARD_SETTINGS_KEY,
  SpendGuardSettings,
  writeAiGuardState,
} from './spend-guard';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const DEFAULTS = {
  creditsPerUsd: 100,
  clientMonthlyLimitUsd: 15,
  clientPausePercent: 130,
  spikeWarnPercent: 100,
  spikePausePercent: 200,
  spikeFloorUsdPerDay: 5,
  spikeFloorUsdPerClientDay: 0.5,
  spikeSnoozeHours: 24,
};

describe('SpendGuardSettings', () => {
  it('{} parses to the spec defaults', () => {
    expect(SpendGuardSettings.parse({})).toEqual(DEFAULTS);
  });
  it('refine rejects pause % <= warn %', () => {
    expect(SpendGuardSettings.safeParse({ spikeWarnPercent: 150, spikePausePercent: 150 }).success).toBe(false);
    expect(SpendGuardSettings.safeParse({ spikeWarnPercent: 150, spikePausePercent: 151 }).success).toBe(true);
  });
  it('effectiveLimitUsd uses the override, else the default', () => {
    const s = SpendGuardSettings.parse({});
    expect(effectiveLimitUsd(null, s)).toBe(15);
    expect(effectiveLimitUsd(22.5, s)).toBe(22.5);
    expect(effectiveLimitUsd('30.00', s)).toBe(30);
    expect(pauseThresholdUsd(10, s)).toBeCloseTo(13);
  });
  it('reads fall back to defaults on a missing or invalid row, and read the stored value', async () => {
    expect(await readSpendGuardSettings(dbs.service)).toEqual(DEFAULTS);
    expect(await readAiGuardState(dbs.service)).toEqual({ state: 'ok' });
    await dbs.owner.insert(platformSetting).values({ key: SPEND_GUARD_SETTINGS_KEY, value: { clientMonthlyLimitUsd: 20 }, updatedBy: 't' });
    expect((await readSpendGuardSettings(dbs.service)).clientMonthlyLimitUsd).toBe(20);
    await dbs.owner.update(platformSetting).set({ value: { clientMonthlyLimitUsd: -1 } }).where(eq(platformSetting.key, SPEND_GUARD_SETTINGS_KEY));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); // warn-once: may already have fired in this process
    try {
      expect(await readSpendGuardSettings(dbs.service)).toEqual(DEFAULTS);
    } finally {
      warn.mockRestore();
    }
  });
  it('writeAiGuardState upserts and round-trips', async () => {
    await writeAiGuardState(dbs.service, { state: 'warn', scope: 'total', observedUsd: 12 }, 'system');
    await writeAiGuardState(dbs.service, { state: 'paused', scope: 'openrouter' }, 'system');
    expect(await readAiGuardState(dbs.service)).toEqual({ state: 'paused', scope: 'openrouter' });
    const rows = await dbs.owner.select().from(platformSetting).where(eq(platformSetting.key, AI_GUARD_STATE_KEY));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updatedBy).toBe('system');
  });
});

describe('spend guard schema', () => {
  it('spend_limit_usd rejects 0 and 10001', async () => {
    const set = (v: number) => errorText(dbs.owner.update(client).set({ spendLimitUsd: v }).where(eq(client.id, IDS.clientA1)));
    expect(await set(0)).toMatch(/client_spend_limit_check/);
    expect(await set(10001)).toMatch(/client_spend_limit_check/);
    await dbs.owner.update(client).set({ spendLimitUsd: 10000 }).where(eq(client.id, IDS.clientA1));
    const [c] = await dbs.owner.select({ l: client.spendLimitUsd, p: client.spendPausedAt }).from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toEqual({ l: 10000, p: null });
  });

  it('app_user cannot read or write spend_guard_event', async () => {
    await dbs.service.insert(spendGuardEvent).values({ kind: 'spike_warn' });
    const scope = { agencyId: IDS.agencyA, clientScope: 'all' as const };
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.select().from(spendGuardEvent)))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.insert(spendGuardEvent).values({ kind: 'spike_warn' })))).toMatch(/permission denied/);
    expect(await errorText(withTenant(dbs.app, scope, (tx) => tx.delete(spendGuardEvent)))).toMatch(/permission denied/);
  });

  it('app_user cannot update spend_limit_usd or spend_paused_at', async () => {
    for (const v of [{ spendLimitUsd: 5 }, { spendPausedAt: new Date() }]) {
      const err = await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.update(client).set(v).where(eq(client.id, IDS.clientA1))));
      expect(err).toMatch(/permission denied/);
    }
  });

  it('one client_reached / client_paused event per client and month, other kinds repeat', async () => {
    const e = { clientId: IDS.clientA1, month: '2026-10-01' };
    await dbs.service.insert(spendGuardEvent).values({ ...e, kind: 'client_reached' });
    expect(await errorText(dbs.service.insert(spendGuardEvent).values({ ...e, kind: 'client_reached' }))).toMatch(/spend_guard_event_client_once/);
    await dbs.service.insert(spendGuardEvent).values({ ...e, kind: 'client_paused' });
    await dbs.service.insert(spendGuardEvent).values([{ ...e, kind: 'client_unpaused' }, { ...e, kind: 'client_unpaused' }]);
    expect(await errorText(dbs.service.insert(spendGuardEvent).values({ kind: 'bogus' as never }))).toMatch(/spend_guard_event_kind_check/);
  });

  it('migration seeds both platform_setting rows once', async () => {
    const file = readFileSync(join(__dirname, '../migrations/0090_spend_guard.sql'), 'utf8');
    const insert = file.split('--> statement-breakpoint').find((s) => /INSERT INTO platform_setting/i.test(s));
    expect(insert).toBeTruthy();
    await dbs.owner.execute(sql.raw(insert as string));
    await dbs.owner.execute(sql.raw(insert as string));
    const rows = await dbs.owner.select().from(platformSetting);
    expect(rows.map((r) => r.key).sort()).toEqual([AI_GUARD_STATE_KEY, SPEND_GUARD_SETTINGS_KEY]);
    expect(rows.find((r) => r.key === AI_GUARD_STATE_KEY)?.value).toEqual({ state: 'ok' });
    expect(rows.find((r) => r.key === SPEND_GUARD_SETTINGS_KEY)?.value).toEqual({});
  });
});

describe('createAiGuard', () => {
  const scopeA = { agencyId: IDS.agencyA, clientId: IDS.clientA1 };

  it('ok and warn allow; platform paused refuses every scope', async () => {
    const g = createAiGuard(dbs.service, { cacheMs: 0 });
    await expect(g.assertAllowed(scopeA)).resolves.toBeUndefined();
    await writeAiGuardState(dbs.service, { state: 'warn' }, 'system');
    await expect(g.assertAllowed(scopeA)).resolves.toBeUndefined();
    await writeAiGuardState(dbs.service, { state: 'paused' }, 'system');
    await expect(g.assertAllowed(scopeA)).rejects.toMatchObject({ name: 'AiPausedError', reason: 'platform' });
    await expect(g.assertAllowed({ agencyId: null, clientId: null })).rejects.toBeInstanceOf(AiPausedError);
  });

  it("a client pause refuses only that client's scope", async () => {
    const g = createAiGuard(dbs.service, { cacheMs: 0 });
    await dbs.owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await expect(g.assertAllowed(scopeA)).rejects.toMatchObject({ reason: 'client' });
    await expect(g.assertAllowed({ agencyId: IDS.agencyA, clientId: IDS.clientA2 })).resolves.toBeUndefined();
    await expect(g.assertAllowed({ agencyId: IDS.agencyA, clientId: null })).resolves.toBeUndefined();
  });

  it('caches for cacheMs, then re-reads', async () => {
    let t = 1_000_000;
    const g = createAiGuard(dbs.service, { cacheMs: 30_000, now: () => t });
    await expect(g.assertAllowed(scopeA)).resolves.toBeUndefined();
    await writeAiGuardState(dbs.service, { state: 'paused' }, 'system');
    await dbs.owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    t += 29_000;
    await expect(g.assertAllowed(scopeA)).resolves.toBeUndefined(); // cached: no re-query
    t += 2_000;
    await expect(g.assertAllowed(scopeA)).rejects.toMatchObject({ reason: 'platform' });
  });

  it('a read failure allows the call and logs once per minute', async () => {
    let t = 5_000_000;
    const boom = { select: () => { throw new Error('connection secret-host'); } } as unknown as typeof dbs.service;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const g = createAiGuard(boom, { cacheMs: 0, now: () => t });
      await expect(g.assertAllowed(scopeA)).resolves.toBeUndefined();
      await expect(g.assertAllowed(scopeA)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-host');
      t += 61_000;
      await g.assertAllowed(scopeA);
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });
});

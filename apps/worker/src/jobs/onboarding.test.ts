import { agencyBilling, agencyOnboarding, billingNotice, pendingSignup } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createOnboardingJobs, dueTipSlot, nextOnboardingStep } from './onboarding';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

const deps = { serviceDb: () => dbs.service } as unknown as WorkerDeps;
const NOW = new Date('2026-10-20T15:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 3_600_000;
const D = 24 * H;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const run = (envName: 'dev' | 'demo' | 'test' = 'dev') =>
  createOnboardingJobs(deps, { envName, now: () => NOW }).nudges.handler({});
const seed = (over: Partial<typeof agencyOnboarding.$inferInsert> = {}) =>
  dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open', createdAt: ago(7 * D), ...over });
const tips = () => dbs.owner.select().from(billingNotice).where(eq(billingNotice.kind, 'onboarding_tip'));

describe('dueTipSlot', () => {
  it.each([
    [23 * H, 0],
    [24 * H, 1],
    [3 * D, 2],
    [7 * D, 3],
    [30 * D, 3],
  ])('age %i ms -> slot %i', (age, slot) => {
    expect(dueTipSlot(ago(age), NOW)).toBe(slot);
  });
});

describe('nextOnboardingStep', () => {
  const base = { profileDoneAt: null, profileSkippedAt: null, teamDoneAt: null, teamSkippedAt: null, planDoneAt: null, planSkippedAt: null, brandingDoneAt: null, brandingSkippedAt: null, firstClientAt: null };
  const d = new Date();
  it('walks profile, team, plan, branding, then first_client, then null', () => {
    expect(nextOnboardingStep(base)).toBe('profile');
    expect(nextOnboardingStep({ ...base, profileDoneAt: d })).toBe('team');
    expect(nextOnboardingStep({ ...base, profileDoneAt: d, teamSkippedAt: d })).toBe('plan');
    expect(nextOnboardingStep({ ...base, profileDoneAt: d, teamDoneAt: d, planDoneAt: d })).toBe('branding');
    const all = { ...base, profileDoneAt: d, teamDoneAt: d, planDoneAt: d, brandingSkippedAt: d };
    expect(nextOnboardingStep(all)).toBe('first_client');
    expect(nextOnboardingStep({ ...all, firstClientAt: d })).toBeNull();
  });
});

describe('onboarding-nudges', () => {
  it('declares name and 15:00 UTC cron', () => {
    expect(createOnboardingJobs(deps, { envName: 'dev' }).nudges).toMatchObject({ name: 'onboarding-nudges', cron: '0 15 * * *' });
  });

  it.each(['demo', 'test'] as const)('returns early in %s', async (envName) => {
    await seed();
    expect(await run(envName)).toEqual({ skipped: envName });
    expect(await tips()).toHaveLength(0);
  });

  it('an agency missing days 1-6 gets ONE day-7 tip and nudges_sent = 3', async () => {
    await seed({ profileDoneAt: ago(D) });
    await run();
    const rows = await tips();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ audience: 'agency', dedupeKey: `onboarding_tip:${IDS.agencyA}:7`, params: { day: 7, nextStep: 'team' } });
    expect((await dbs.owner.select().from(agencyOnboarding))[0]!.nudgesSent).toBe(3);
  });

  it('under 24 h sends nothing', async () => {
    await seed({ createdAt: ago(23 * H) });
    await run();
    expect(await tips()).toHaveLength(0);
  });

  it('all steps done but no client: the tip points at first_client', async () => {
    await seed({ profileDoneAt: NOW, teamDoneAt: NOW, planSkippedAt: NOW, brandingDoneAt: NOW });
    await run();
    expect((await tips())[0]!.params).toEqual({ day: 7, nextStep: 'first_client' });
  });

  it('nothing left to do: no tip and no counter bump', async () => {
    await seed({ profileDoneAt: NOW, teamDoneAt: NOW, planDoneAt: NOW, brandingDoneAt: NOW, firstClientAt: NOW });
    await run();
    expect(await tips()).toHaveLength(0);
    expect((await dbs.owner.select().from(agencyOnboarding))[0]!.nudgesSent).toBe(0);
  });

  it.each([
    ['completed', { completedAt: NOW }],
    ['dismissed', { dismissedAt: NOW }],
    ['unsubscribed', { unsubscribedAt: NOW }],
    ['legacy', { source: 'legacy' as const }],
  ])('%s onboarding is skipped', async (_n, over) => {
    await seed(over);
    await run();
    expect(await tips()).toHaveLength(0);
  });

  it('a read_only agency is skipped', async () => {
    await seed();
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'read_only' });
    await run();
    expect(await tips()).toHaveLength(0);
  });

  it('double run sends once; a later slot sends the next tip', async () => {
    await seed({ createdAt: ago(25 * H) });
    await run();
    await run();
    expect(await tips()).toHaveLength(1);
    expect((await tips())[0]!.params).toMatchObject({ day: 1 });
    await dbs.owner.update(agencyOnboarding).set({ createdAt: ago(4 * D) });
    await run();
    const rows = await tips();
    expect(rows.map((r) => (r.params as { day: number }).day).sort()).toEqual([1, 3]);
  });

  it('cleanup deletes only pending_signup rows expired more than 30 days ago', async () => {
    const row = (email: string, expiresAt: Date) => ({ email, agencyName: 'X', source: 'open' as const, ipHash: 'h', expiresAt });
    await dbs.owner.insert(pendingSignup).values([
      row('old@x.test', ago(31 * D)),
      row('recent@x.test', ago(29 * D)),
      row('future@x.test', new Date(NOW.getTime() + D)),
    ]);
    const out = await run();
    expect(out).toMatchObject({ cleaned: 1 });
    const left = (await dbs.owner.select().from(pendingSignup)).map((r) => r.email).sort();
    expect(left).toEqual(['future@x.test', 'recent@x.test']);
  });
});

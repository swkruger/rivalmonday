import { platformAdmin, platformCostService, platformCostSnapshot } from '@cs/db';
import { openTestDbs, seedPlatformCostServices, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRes, spyConsole } from '../../../test/cost-utils';
import { seedUser, truncateAuth } from '../../../test/fixtures';
import { evaluateAlerts, platformOwnerEmails } from './alerts';
import { snapshotAll, type SnapshotDeps } from './snapshot';
import type { CostEnv, ServiceKey } from './types';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

const dfs = JSON.parse(readFileSync(join(__dirname, 'adapters/fixtures/dataforseo-user-data.json'), 'utf8')) as unknown;
const ENV: CostEnv = { OPENROUTER_API_KEY: 'k1', DATAFORSEO_LOGIN: 'l', DATAFORSEO_PASSWORD: 'p', SCRAPECREATORS_API_KEY: 'k3' };

let orBalance = 20;
let orFails = false;
let dfsThrows = false;
const route = (async (input: unknown) => {
  const host = new URL(String(input)).hostname;
  if (host === 'openrouter.ai') return orFails ? jsonRes({ e: 1 }, 401) : jsonRes({ data: { total_credits: orBalance, total_usage: 0 } });
  if (host === 'api.dataforseo.com') {
    if (dfsThrows) throw new Error('boom');
    return jsonRes(dfs);
  }
  if (host === 'api.scrapecreators.com') return jsonRes({ creditCount: 7099 });
  throw new Error(`unexpected host ${host}`);
}) as unknown as typeof fetch;

let clock = new Date('2026-10-13T06:00:00Z');
const sent: { to: string; label: string; amountText: string; daysLeft: number | null }[] = [];
let sendFails = false;
const mk = (over: Partial<SnapshotDeps> = {}): SnapshotDeps => ({
  service: dbs.service,
  env: ENV,
  fetchImpl: route,
  now: () => clock,
  platformAdmins: ['boss@example.com'],
  appUrl: 'https://app.example',
  sendLowEmail: async (to, p) => {
    if (sendFails) throw new Error('smtp down to boss@example.com');
    sent.push({ to, label: p.label, amountText: p.amountText, daysLeft: p.daysLeft });
  },
  ...over,
});
const nextDay = () => (clock = new Date(clock.getTime() + 86_400_000));
const rows = (service: ServiceKey) => dbs.owner.select().from(platformCostSnapshot).where(eq(platformCostSnapshot.service, service));
const svc = async (service: ServiceKey) => (await dbs.owner.select().from(platformCostService).where(eq(platformCostService.service, service)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedPlatformCostServices(dbs.owner);
  await dbs.owner.update(platformCostService).set({ lowThresholdUsd: '5' }).where(eq(platformCostService.service, 'openrouter'));
  orBalance = 20;
  orFails = false;
  dfsThrows = false;
  sendFails = false;
  sent.length = 0;
  clock = new Date('2026-10-13T06:00:00Z');
});

describe('snapshotAll', () => {
  it('writes one row per configured enabled service; none for not_configured or disabled', async () => {
    await dbs.owner.update(platformCostService).set({ enabled: false }).where(eq(platformCostService.service, 'dataforseo'));
    const r = await snapshotAll(mk());
    expect(r.written).toBe(2);
    expect(r.statuses).toEqual({ openrouter: 'ok', dataforseo: 'disabled', scrapecreators: 'ok', apify: 'not_configured', anthropic: 'not_configured', neon: 'not_configured' });
    const all = await dbs.owner.select().from(platformCostSnapshot);
    expect(all.map((x) => x.service).sort()).toEqual(['openrouter', 'scrapecreators']);
    expect(all.find((x) => x.service === 'openrouter')).toMatchObject({ status: 'ok', kind: 'balance', amountUsd: '20.0000', takenAt: clock });
  });

  it('one adapter throwing does not stop the others', async () => {
    dfsThrows = true;
    const r = await snapshotAll(mk());
    expect(r.statuses.openrouter).toBe('ok');
    expect(r.statuses.dataforseo).toBe('error');
    expect((await rows('dataforseo'))[0]).toMatchObject({ status: 'error' });
    expect(await rows('openrouter')).toHaveLength(1);
  });

  it('a rejected adapter promise is stored as error "internal"', async () => {
    const r = await snapshotAll(mk({ adapters: { dataforseo: async () => { throw new Error('x'); } } }));
    expect(r.statuses.dataforseo).toBe('error');
    expect((await rows('dataforseo'))[0]).toMatchObject({ status: 'error', error: 'internal' });
  });

  it('scrapecreators amount uses unit_rate_usd; null when unset', async () => {
    await snapshotAll(mk());
    expect((await rows('scrapecreators'))[0]).toMatchObject({ units: '7099.0000', amountUsd: null });
    await dbs.owner.update(platformCostService).set({ unitRateUsd: '0.0002' }).where(eq(platformCostService.service, 'scrapecreators'));
    nextDay();
    await snapshotAll(mk());
    const latest = (await rows('scrapecreators')).find((x) => x.takenAt.getTime() === clock.getTime())!;
    expect(latest.amountUsd).toBe('1.4198');
  });

  it('rounds float noise to 4 dp', async () => {
    orBalance = 20 - 3.91;
    await snapshotAll(mk());
    expect((await rows('openrouter'))[0]!.amountUsd).toBe('16.0900');
  });
});

describe('evaluateAlerts', () => {
  it('emails each owner once when a service newly turns low, and sets alerted_at', async () => {
    await seedUser(dbs.owner, 'u1', 'Owner2@Example.com');
    await dbs.owner.insert(platformAdmin).values({ userId: 'u1', role: 'owner' });
    orBalance = 3;
    await snapshotAll(mk());
    expect(sent.map((s) => s.to).sort()).toEqual(['boss@example.com', 'owner2@example.com']);
    expect(sent[0]).toMatchObject({ label: 'OpenRouter', amountText: '$3.00' });
    expect((await svc('openrouter')).alertedAt).toEqual(clock);
  });

  it('no second email on the next run while still low', async () => {
    orBalance = 3;
    await snapshotAll(mk());
    const n = sent.length;
    nextDay();
    await snapshotAll(mk());
    expect(sent).toHaveLength(n);
  });

  it('recovery clears alerted_at and the next low emails again', async () => {
    orBalance = 3;
    await snapshotAll(mk());
    expect(sent).toHaveLength(1);
    orBalance = 40;
    nextDay();
    await snapshotAll(mk());
    expect((await svc('openrouter')).alertedAt).toBeNull();
    orBalance = 2;
    nextDay();
    await snapshotAll(mk());
    expect(sent).toHaveLength(2);
  });

  it('error snapshot neither sends nor clears', async () => {
    orBalance = 3;
    await snapshotAll(mk());
    expect(sent).toHaveLength(1);
    orFails = true;
    nextDay();
    const r = await snapshotAll(mk());
    expect(r.statuses.openrouter).toBe('error');
    expect(sent).toHaveLength(1);
    expect((await svc('openrouter')).alertedAt).not.toBeNull();
  });

  it('days-left rule: a fast burn flags low even above the threshold', async () => {
    await dbs.owner.update(platformCostService).set({ lowThresholdUsd: null, warnDays: 7 }).where(eq(platformCostService.service, 'openrouter'));
    orBalance = 100;
    await snapshotAll(mk());
    orBalance = 40; // 60/day burn -> 0 days left
    nextDay();
    await snapshotAll(mk());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.daysLeft).toBe(0);
  });

  it('send failure is swallowed, alerted_at is still set, and the log has no address or amount', async () => {
    const spy = spyConsole();
    sendFails = true;
    orBalance = 3;
    await snapshotAll(mk());
    const out = spy.output();
    spy.restore();
    expect(out).toContain('[platform-costs] email failed for openrouter');
    expect(out).not.toContain('boss@example.com');
    expect(out).not.toContain('3.00');
    expect((await svc('openrouter')).alertedAt).not.toBeNull();
  });

  it('evaluateAlerts alone reports emailed services', async () => {
    orBalance = 3;
    await snapshotAll(mk());
    await dbs.owner.update(platformCostService).set({ alertedAt: null }).where(eq(platformCostService.service, 'openrouter'));
    expect(await evaluateAlerts(mk())).toEqual({ emailed: ['openrouter'], cleared: [] });
  });
});

describe('platformOwnerEmails', () => {
  it('= env list ∪ owner rows, excludes staff/viewer and revoked, lower-cased and deduped', async () => {
    await seedUser(dbs.owner, 'o1', 'Own@Example.com');
    await seedUser(dbs.owner, 'o2', 'boss@example.com');
    await seedUser(dbs.owner, 's1', 'staff@example.com');
    await seedUser(dbs.owner, 'v1', 'viewer@example.com');
    await seedUser(dbs.owner, 'r1', 'revoked@example.com');
    await dbs.owner.insert(platformAdmin).values([
      { userId: 'o1', role: 'owner' },
      { userId: 'o2', role: 'owner' },
      { userId: 's1', role: 'staff' },
      { userId: 'v1', role: 'viewer' },
      { userId: 'r1', role: 'owner', revokedAt: new Date() },
    ]);
    const got = await platformOwnerEmails({ service: dbs.service, platformAdmins: ['boss@example.com', 'env@example.com'] });
    expect([...got].sort()).toEqual(['boss@example.com', 'env@example.com', 'own@example.com']);
  });
});

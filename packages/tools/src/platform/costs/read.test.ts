import { type Db, platformCostService, platformCostSnapshot } from '@cs/db';
import { openTestDbs, seedPlatformCostServices, truncateAll } from '@cs/db/test-helpers';
import { and, desc, eq, gte } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCostState, type ServiceState, toSnapPoint } from './read';
import { type ServiceKey, SERVICES } from './types';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

/** The pre-launch-gate implementation (2 sequential queries per service), kept verbatim as the output oracle. */
async function legacyLoadCostState(db: Db, since: Date): Promise<ServiceState[]> {
  const configs = await db.select().from(platformCostService);
  const out: ServiceState[] = [];
  for (const service of Object.keys(SERVICES) as ServiceKey[]) {
    const [latest] = await db.select().from(platformCostSnapshot).where(eq(platformCostSnapshot.service, service)).orderBy(desc(platformCostSnapshot.takenAt)).limit(1);
    const rows = await db
      .select()
      .from(platformCostSnapshot)
      .where(and(eq(platformCostSnapshot.service, service), gte(platformCostSnapshot.takenAt, since)))
      .orderBy(platformCostSnapshot.takenAt);
    out.push({ service, config: configs.find((c) => c.service === service) ?? null, latest: latest ?? null, points: rows.map(toSnapPoint) });
  }
  return out;
}

/** Counts every query builder the handle starts (`select`, `selectDistinct`, `selectDistinctOn`, `execute`, ...). */
function countingDb(db: Db): { db: Db; count: () => number } {
  let n = 0;
  const proxy = new Proxy(db, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv) as unknown;
      if (typeof v === 'function' && typeof prop === 'string' && (prop.startsWith('select') || prop === 'execute')) {
        return (...args: unknown[]) => {
          n++;
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return v;
    },
  });
  return { db: proxy, count: () => n };
}

const SINCE = new Date('2026-10-01T00:00:00Z');
const at = (iso: string) => new Date(iso);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedPlatformCostServices(dbs.owner);
  // Neon has no config row (not seeded) and no snapshots: config null, latest null, points [].
  await dbs.owner.delete(platformCostService).where(eq(platformCostService.service, 'neon'));
  await dbs.owner.insert(platformCostSnapshot).values([
    // openrouter: several, one before `since` (latest-eligible only), newest last.
    { service: 'openrouter', takenAt: at('2026-09-20T06:00:00Z'), status: 'ok', kind: 'balance', amountUsd: '30' },
    { service: 'openrouter', takenAt: at('2026-10-02T06:00:00Z'), status: 'ok', kind: 'balance', amountUsd: '25.5' },
    { service: 'openrouter', takenAt: at('2026-10-03T06:00:00Z'), status: 'error', kind: 'balance', error: 'HTTP 401' },
    { service: 'openrouter', takenAt: at('2026-10-04T06:00:00Z'), status: 'ok', kind: 'balance', amountUsd: '20', capUsd: '100' },
    // apify: only an old one — latest set, points empty.
    { service: 'apify', takenAt: at('2026-09-01T06:00:00Z'), status: 'ok', kind: 'usage', amountUsd: '3' },
    // scrapecreators: one in range.
    { service: 'scrapecreators', takenAt: at('2026-10-05T06:00:00Z'), status: 'ok', kind: 'balance', amountUsd: '7', units: '7099' },
  ]);
});

describe('loadCostState (launch gate Task 5)', () => {
  it('returns the same state as the per-service implementation (empty, old-only and multi-snapshot services)', async () => {
    const expected = await legacyLoadCostState(dbs.service, SINCE);
    const got = await loadCostState(dbs.service, SINCE);
    expect(got).toEqual(expected);
    // Pin the shape the oracle produced, so a broken oracle cannot pass silently.
    expect(got.map((s) => s.service)).toEqual(['openrouter', 'dataforseo', 'scrapecreators', 'apify', 'anthropic', 'neon']);
    const by = Object.fromEntries(got.map((s) => [s.service, s]));
    expect(by.openrouter!.points.map((p) => p.amountUsd)).toEqual([25.5, null, 20]);
    expect(by.openrouter!.latest?.takenAt).toEqual(at('2026-10-04T06:00:00Z'));
    expect(by.apify!.latest?.amountUsd).toBe('3.0000');
    expect(by.apify!.points).toEqual([]);
    expect(by.dataforseo).toMatchObject({ latest: null, points: [] });
    expect(by.dataforseo!.config?.service).toBe('dataforseo');
    expect(by.neon).toEqual({ service: 'neon', config: null, latest: null, points: [] });
  });

  it('issues at most 3 queries for the six services', async () => {
    const { db, count } = countingDb(dbs.service);
    await loadCostState(db, SINCE);
    expect(count()).toBeLessThanOrEqual(3);
  });
});

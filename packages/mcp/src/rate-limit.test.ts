import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, RATE_LIMITS } from './rate-limit';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const MIN = 60_000;
const DAY = 86_400_000;
// Fixed instant, mid-minute and mid-day (UTC 2026-10-12T10:00:30Z).
const T0 = new Date('2026-10-12T10:00:30.000Z');

async function windowCount(tokenKey: string, kind: 'minute' | 'day', windowStart: Date): Promise<number | undefined> {
  const rows = await dbs.owner.execute<{ count: number }>(sql`
    SELECT count FROM mcp_rate_window
    WHERE token_key = ${tokenKey} AND window_kind = ${kind} AND window_start = ${windowStart.toISOString()}::timestamptz`);
  return [...rows][0]?.count;
}

describe('checkRateLimit', () => {
  it('61 concurrent calls admit exactly 60', async () => {
    const results = await Promise.all(Array.from({ length: 61 }, () => checkRateLimit(dbs.service, 'pat:concurrent', T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(RATE_LIMITS.perMinute);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it('minute rollover resets', async () => {
    for (let i = 0; i < RATE_LIMITS.perMinute; i++) {
      expect(await checkRateLimit(dbs.service, 'pat:rollover', T0)).toEqual({ ok: true });
    }
    expect(await checkRateLimit(dbs.service, 'pat:rollover', T0)).toMatchObject({ ok: false });
    const nextMinute = new Date(T0.getTime() + MIN);
    expect(await checkRateLimit(dbs.service, 'pat:rollover', nextMinute)).toEqual({ ok: true });
  });

  it('day cap: call 2001 refused with seconds to UTC midnight', async () => {
    const now = new Date('2026-10-12T22:00:00.000Z');
    const dayStart = new Date('2026-10-12T00:00:00.000Z');
    // Seed the day window at its cap so the next call is the 2001st of the day.
    await dbs.owner.execute(sql`
      INSERT INTO mcp_rate_window (token_key, window_kind, window_start, count)
      VALUES ('pat:daycap', 'day', ${dayStart.toISOString()}::timestamptz, ${RATE_LIMITS.perDay})`);
    expect(await checkRateLimit(dbs.service, 'pat:daycap', now)).toEqual({ ok: false, retryAfterS: 2 * 3600 });
    expect(await windowCount('pat:daycap', 'day', dayStart)).toBe(RATE_LIMITS.perDay + 1);
  });

  it('keys are isolated', async () => {
    for (let i = 0; i < RATE_LIMITS.perMinute; i++) await checkRateLimit(dbs.service, 'pat:a', T0);
    expect(await checkRateLimit(dbs.service, 'pat:a', T0)).toMatchObject({ ok: false });
    expect(await checkRateLimit(dbs.service, 'oauth:b', T0)).toEqual({ ok: true });
  });

  it('first call of a day deletes rows older than yesterday', async () => {
    const dayStart = new Date(Math.floor(T0.getTime() / DAY) * DAY);
    const twoDaysAgo = new Date(dayStart.getTime() - 2 * DAY);
    const yesterday = new Date(dayStart.getTime() - DAY);
    await dbs.owner.execute(sql`
      INSERT INTO mcp_rate_window (token_key, window_kind, window_start, count) VALUES
        ('pat:prune', 'day', ${twoDaysAgo.toISOString()}::timestamptz, 5),
        ('pat:prune', 'day', ${yesterday.toISOString()}::timestamptz, 7)`);
    expect(await checkRateLimit(dbs.service, 'pat:prune', T0)).toEqual({ ok: true });
    expect(await windowCount('pat:prune', 'day', twoDaysAgo)).toBeUndefined();
    expect(await windowCount('pat:prune', 'day', yesterday)).toBe(7);
  });

  it('retryAfterS is at least 1 second', async () => {
    const minuteStart = new Date(Math.floor(T0.getTime() / MIN) * MIN);
    await dbs.owner.execute(sql`
      INSERT INTO mcp_rate_window (token_key, window_kind, window_start, count)
      VALUES ('pat:retry', 'minute', ${minuteStart.toISOString()}::timestamptz, ${RATE_LIMITS.perMinute})`);
    const almostNextMinute = new Date(minuteStart.getTime() + MIN - 1);
    expect(await checkRateLimit(dbs.service, 'pat:retry', almostNextMinute)).toEqual({ ok: false, retryAfterS: 1 });
  });
});

import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/** Public-intake rate limits (11c). `ipPerHour` is keyed per hashed IP, `linkPerDay` per intake link, `platformPerDay` globally. */
export const INTAKE_LIMITS = { ipPerHour: 5, linkPerDay: 50, platformPerDay: 200 } as const;

/**
 * Counts one hit against `key` in the current hour/UTC-day window and reports whether it is within `limit`.
 * The upsert is atomic, so concurrent hits cannot overshoot the limit.
 */
export async function hitRate(db: Db, key: string, window: 'hour' | 'day', limit: number, now: Date): Promise<boolean> {
  const start = window === 'hour'
    ? new Date(Math.floor(now.getTime() / 36e5) * 36e5)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [row] = await db.execute<{ count: number }>(sql`
    INSERT INTO intake_rate (key, window_start, count) VALUES (${key}, ${start.toISOString()}::timestamptz, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = intake_rate.count + 1
    RETURNING count`);
  return Number(row!.count) <= limit;
}

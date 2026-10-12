import { type Db } from '@cs/db';
import { sql } from 'drizzle-orm';

export const RATE_LIMITS = { perMinute: 60, perDay: 2000 } as const;
const MIN = 60_000, DAY = 86_400_000;

export async function checkRateLimit(db: Db, tokenKey: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; retryAfterS: number }> {
  const t = now.getTime();
  const minuteStart = new Date(Math.floor(t / MIN) * MIN);
  const dayStart = new Date(Math.floor(t / DAY) * DAY); // UTC midnight
  // One statement: both windows are bumped atomically; concurrent calls serialise on the row locks of ON CONFLICT.
  const rows = [...(await db.execute<{ kind: 'minute' | 'day'; count: number }>(sql`
    INSERT INTO mcp_rate_window (token_key, window_kind, window_start, count)
    VALUES (${tokenKey}, 'minute', ${minuteStart.toISOString()}::timestamptz, 1),
           (${tokenKey}, 'day', ${dayStart.toISOString()}::timestamptz, 1)
    ON CONFLICT (token_key, window_kind, window_start) DO UPDATE SET count = mcp_rate_window.count + 1
    RETURNING window_kind AS kind, count`))];
  const minute = rows.find((r) => r.kind === 'minute')!.count;
  const day = rows.find((r) => r.kind === 'day')!.count;
  if (day === 1) {
    await db.execute(sql`DELETE FROM mcp_rate_window WHERE token_key = ${tokenKey} AND window_start < ${new Date(dayStart.getTime() - DAY).toISOString()}::timestamptz`);
  }
  if (day > RATE_LIMITS.perDay) return { ok: false, retryAfterS: Math.max(1, Math.ceil((dayStart.getTime() + DAY - t) / 1000)) };
  if (minute > RATE_LIMITS.perMinute) return { ok: false, retryAfterS: Math.max(1, Math.ceil((minuteStart.getTime() + MIN - t) / 1000)) };
  return { ok: true };
}

export const DAY = 86_400_000;

/** Spec §4: every demo timestamp is relative to the moment of seeding. */
export interface DemoClock {
  now: Date;
  daysAgo(days: number): Date;
  /** The next delivery Monday strictly after today (UTC date), YYYY-MM-DD. */
  nextMonday: string;
  /** The four Mondays before `nextMonday`, newest first. */
  pastMondays: string[];
  monthStart: Date;
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function createClock(now: Date): DemoClock {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const toNext = (8 - new Date(today).getUTCDay()) % 7 || 7;
  const next = today + toNext * DAY;
  return {
    now,
    daysAgo: (days) => new Date(now.getTime() - days * DAY),
    nextMonday: isoDate(next),
    pastMondays: [1, 2, 3, 4].map((w) => isoDate(next - 7 * w * DAY)),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

export const atUtc = (isoDay: string, hour = 0): Date => new Date(`${isoDay}T${String(hour).padStart(2, '0')}:00:00Z`);

/** `d`, or `limit` when `d` would be later. */
export const notAfter = (d: Date, limit: Date): Date => (d.getTime() > limit.getTime() ? limit : d);

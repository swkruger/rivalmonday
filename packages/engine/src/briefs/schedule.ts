/** Spec §9.1: briefs are written Thursday night and approved Friday for Monday delivery, in the client's local time. */
export const BRIEF_LOCAL_WEEKDAY = 4; // Thursday (0 = Sunday)
export const BRIEF_LOCAL_HOUR = 22;
/** Missed ticks (worker restart, outage) may still generate until Friday noon local. */
export const BRIEF_CATCHUP_UNTIL_HOUR = 12;
export const DEFAULT_TIMEZONE = 'America/Chicago';
export const BRIEF_FIRST_PERIOD_DAYS = 7;
export const BRIEF_MAX_PERIOD_DAYS = 14;
const DAY_MS = 86_400_000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function localParts(now: Date, tz: string): { year: number; month: number; day: number; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: WEEKDAYS[parts.weekday!]!, hour: Number(parts.hour) };
}

export function briefDue(now: Date, tz: string): boolean {
  const p = localParts(now, tz);
  if (p.weekday === BRIEF_LOCAL_WEEKDAY) return p.hour >= BRIEF_LOCAL_HOUR;
  return p.weekday === (BRIEF_LOCAL_WEEKDAY + 1) % 7 && p.hour < BRIEF_CATCHUP_UNTIL_HOUR;
}

/** The first local Monday strictly after the local date of `now`. */
export function deliveryDateFor(now: Date, tz: string): string {
  const p = localParts(now, tz);
  const local = Date.UTC(p.year, p.month - 1, p.day);
  const ahead = ((1 - p.weekday + 7) % 7) || 7;
  return new Date(local + ahead * DAY_MS).toISOString().slice(0, 10);
}

export function briefPeriod(now: Date, previousEnd: Date | null): { start: Date; end: Date } {
  const t = now.getTime();
  if (!previousEnd) return { start: new Date(t - BRIEF_FIRST_PERIOD_DAYS * DAY_MS), end: now };
  const start = Math.min(Math.max(previousEnd.getTime(), t - BRIEF_MAX_PERIOD_DAYS * DAY_MS), t - DAY_MS);
  return { start: new Date(start), end: now };
}

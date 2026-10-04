import type { QuietHours } from '@cs/db';

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (tz: string) => {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
    formatters.set(tz, f);
  }
  return f;
};

/** The wall clock in `tz` (callers pass a zone already checked with safeTimezone). */
export function localClock(now: Date, tz: string): { date: string; hour: number; minute: number; weekday: number } {
  const p = Object.fromEntries(formatter(tz).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: WEEKDAYS[p.weekday ?? ''] ?? 0 };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** UTC instant of a local wall time; two correction passes absorb a DST offset change between guess and answer. */
export function zonedTimeToUtc(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const target = Date.UTC(y!, m! - 1, d!, h!, mi!);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const c = localClock(new Date(guess), tz);
    const [cy, cm, cd] = c.date.split('-').map(Number);
    guess += target - Date.UTC(cy!, cm! - 1, cd!, c.hour, c.minute);
  }
  return new Date(guess);
}

export function parseHhmm(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** When the recipient's quiet window ends, if `now` is inside it; null otherwise (and for a missing/malformed window). */
export function quietUntil(now: Date, tz: string, quiet: QuietHours | null): Date | null {
  if (!quiet) return null;
  const start = parseHhmm(quiet.start);
  const end = parseHhmm(quiet.end);
  if (start === null || end === null || start === end) return null;
  const c = localClock(now, tz);
  const m = c.hour * 60 + c.minute;
  const inside = start < end ? m >= start && m < end : m >= start || m < end;
  if (!inside) return null;
  const endDate = start < end || m < end ? c.date : addDays(c.date, 1);
  return zonedTimeToUtc(endDate, quiet.end, tz);
}

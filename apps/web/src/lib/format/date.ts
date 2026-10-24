const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type Parsed = { at: Date; dateOnly: boolean };

function parse(v: string | Date): Parsed | null {
  const dateOnly = typeof v === 'string' && DATE_ONLY.test(v);
  const at = typeof v === 'string' ? new Date(dateOnly ? `${v}T00:00:00.000Z` : v) : v;
  return Number.isNaN(at.getTime()) ? null : { at, dateOnly };
}

/** The zone to format in: an unknown zone falls back to UTC; a date-only value is a calendar day, never shifted. */
function zoneOf(tz: string, dateOnly: boolean): string {
  if (dateOnly) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

const yearIn = (d: Date, tz: string): string => new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(d);

/**
 * "Oct 21" in the current year, "Oct 21, 2025" otherwise (year compared in `tz`). A date-only value ("2026-10-13") is that
 * calendar day in every zone; anything that is not a date comes back unchanged.
 */
export function formatDate(v: string | Date, o: { tz: string; withYear?: 'auto' | 'always' | 'never'; now?: Date }): string {
  const p = parse(v);
  if (!p) return String(v);
  const tz = zoneOf(o.tz, p.dateOnly);
  const showYear = o.withYear !== 'never' && (o.withYear === 'always' || yearIn(p.at, tz) !== yearIn(o.now ?? new Date(), zoneOf(o.tz, false)));
  return p.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}), timeZone: tz });
}

/** "Oct 21, 9:00 AM" (year added when not the current one); `zoneLabel` appends the short generic zone name ("CT", "UTC"). */
export function formatDateTime(v: string | Date, o: { tz: string; zoneLabel?: boolean; now?: Date }): string {
  const p = parse(v);
  if (!p) return String(v);
  const tz = zoneOf(o.tz, false);
  const showYear = yearIn(p.at, tz) !== yearIn(o.now ?? new Date(), tz);
  const text = p.at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  } as Intl.DateTimeFormatOptions).replace(' at ', ', ');
  return o.zoneLabel ? `${text} ${zoneName(p.at, tz)}` : text;
}

/** "CT"/"ET" (generic, not "CDT"); UTC stays "UTC"; zones with no short generic name fall back to the short name. */
function zoneName(at: Date, tz: string): string {
  if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT') return 'UTC';
  const name = (style: 'shortGeneric' | 'short'): string =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(at).find((x) => x.type === 'timeZoneName')?.value ?? tz;
  const generic = name('shortGeneric');
  return generic.includes(' ') || generic.startsWith('GMT') ? name('short') : generic;
}

/** "CT"/"ET"/"UTC": the short generic name of `tz` at `at` (an unknown zone reads as UTC). */
export function zoneLabel(tz: string, at: Date = new Date()): string {
  return zoneName(at, zoneOf(tz, false));
}

/** Server-safe relative time: "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date in `o.tz` (UTC by default); future: "in 3 days". */
export function formatRelative(v: string | Date, now: Date = new Date(), o: { tz?: string } = {}): string {
  const p = parse(v);
  if (!p) return String(v);
  const diff = now.getTime() - p.at.getTime();
  const future = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const when = (text: string): string => (future ? `in ${text}` : `${text} ago`);
  if (mins < 1) return 'just now';
  if (mins < 60) return when(`${mins} min`);
  if (hours < 24) return when(`${hours} h`);
  if (days === 1) return future ? 'tomorrow' : 'yesterday';
  if (days < 30) return when(`${days} days`);
  return formatDate(p.at, { tz: o.tz ?? 'UTC', now });
}

/** "Week of Oct 20": the Monday of the week containing `v`, in `tz`. */
export function formatWeekOf(v: string | Date, o: { tz: string; now?: Date }): string {
  const p = parse(v);
  if (!p) return String(v);
  const tz = zoneOf(o.tz, p.dateOnly);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(p.at)
      .map((x) => [x.type, x.value]),
  );
  const sinceMonday = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).indexOf(parts.weekday as 'Mon');
  const monday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - sinceMonday));
  const showYear = String(monday.getUTCFullYear()) !== yearIn(o.now ?? new Date(), tz);
  return `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })}`;
}

const YEAR_MONTH = /^\d{4}-\d{2}$/;

/** "Oct 2026" / "October 2026" (`style: 'long'`); a 'YYYY-MM' string is that month in every zone (no shift). The year always shows. */
export function formatMonth(v: string | Date, o: { tz: string; style?: 'short' | 'long'; now?: Date }): string {
  const ym = typeof v === 'string' && YEAR_MONTH.test(v);
  const p = parse(ym ? `${v}-01` : v);
  if (!p) return String(v);
  const tz = zoneOf(o.tz, p.dateOnly);
  return p.at.toLocaleDateString('en-US', { month: o.style === 'long' ? 'long' : 'short', year: 'numeric', timeZone: tz });
}

/** "2026-10-18": the calendar day of `v` in `tz` (keys, chart labels); a date-only value comes back unchanged, a non-date as-is. */
export function localDay(v: string | Date, tz: string): string {
  const p = parse(v);
  if (!p) return String(v);
  if (p.dateOnly) return v as string;
  return new Intl.DateTimeFormat('en-CA', { timeZone: zoneOf(tz, false), year: 'numeric', month: '2-digit', day: '2-digit' }).format(p.at);
}

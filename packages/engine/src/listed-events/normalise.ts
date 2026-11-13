const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_WORDS = new Set([...MONTHS, 'january','february','march','april','june','july','august','sept','september','october','november','december']);
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_WORDS = new Set([...DAYS, 'tues','thur','thurs','sunday','monday','tuesday','wednesday','thursday','friday','saturday']);
const STOP = new Set(['the','a','an','and','of','at','with','in','on','for','to','by','presents','featuring','feat','ft','w','live','night','show','tickets']);
export function normaliseEventName(s: string): string {
  const base = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '');
  const cleaned = base.replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ').replace(/[^a-z0-9]+/g, ' ');
  const kept = cleaned.split(' ').filter((w) => w && !STOP.has(w) && !MONTH_WORDS.has(w) && !DAY_WORDS.has(w) && !/^\d{1,2}(st|nd|rd|th)?$/.test(w));
  return (kept.length ? kept : base.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)).join(' ');
}
export const nameTokens = (norm: string): string[] => [...new Set(norm.split(' ').filter(Boolean))];
export const eventKey = (nameNorm: string, startDate: string): string => `${startDate}:${nameNorm.slice(0, 120)}`;
/** 'YYYY-MM-DD' of `at` in `tz`. */
export const localDate = (at: Date, tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const PANEL_RE = /^\s*(?:([a-z]{3})[a-z]*\.?,?\s+)?([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?)?/i;
export function panelDate(subtitle: string | null, capturedAt: Date, tz: string): { startDate: string; startsAt: string | null } | null {
  const m = PANEL_RE.exec(subtitle ?? ''); if (!m) return null;
  const wd = m[1] ? DAYS.indexOf(m[1].toLowerCase()) : -1, mon = MONTHS.indexOf(m[2]!.toLowerCase()), day = Number(m[3]);
  if (mon < 0 || (m[1] && wd < 0)) return null;
  const today = localDate(capturedAt, tz), y0 = Number(today.slice(0, 4));
  for (const y of [y0, y0 + 1]) {
    const d = new Date(Date.UTC(y, mon, day));
    if (d.getUTCMonth() !== mon) continue;                        // Feb 29 in a non-leap year
    const iso = d.toISOString().slice(0, 10);
    if (iso < today || (wd >= 0 && d.getUTCDay() !== wd)) continue;
    let startsAt: string | null = null;
    if (m[4]) { const h = (Number(m[4]) % 12) + (m[6]!.toLowerCase() === 'p' ? 12 : 0); startsAt = zonedIso(iso, h, Number(m[5] ?? 0), tz); }
    return { startDate: iso, startsAt };
  }
  return null;
}
/** Offset of `tz` at `instant` in minutes east of UTC (0 for GMT/UTC). */
function offsetMinutes(instant: number, tz: string): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(instant)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}
/** UTC ISO instant of wall time `h:min` on `date` ('YYYY-MM-DD') in `tz`. Applied twice so DST edges settle. */
function zonedIso(date: string, h: number, min: number, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, min);
  const once = wall - offsetMinutes(wall, tz) * 60_000;
  return new Date(wall - offsetMinutes(once, tz) * 60_000).toISOString();
}

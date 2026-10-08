/**
 * GET query-string state for the Changes feed (Task 8 brief). Everything here is derived from the URL — no
 * client-side state — so the feed, its filters and the viewer slot (Task 9) all read the same source of truth.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9_]{1,80}$/;
const ROUTES = ['flagged', 'all', 'archive'] as const;
const DAYS = [7, 30, 90, 365] as const;
const TABS = ['side', 'text', 'details'] as const;

export interface ChangesParams {
  competitor?: string;
  type?: string;
  service?: string;
  route: (typeof ROUTES)[number];
  days: (typeof DAYS)[number];
  q?: string;
  offset: number;
  event?: string;
  change?: string;
  tab: (typeof TABS)[number];
}

type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a (possibly repeated) query param, trimmed, or `undefined` when blank/absent. */
function one(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
}

function pickEnum<T extends string>(list: readonly T[], v: string | undefined, fallback: T): T {
  return v !== undefined && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function pickNum<T extends number>(list: readonly T[], v: string | undefined, fallback: T): T {
  const n = v === undefined ? NaN : Number(v);
  return (list as readonly number[]).includes(n) ? (n as T) : fallback;
}

function id(sp: SearchParams, key: string): string | undefined {
  const v = one(sp[key]);
  return v && UUID.test(v) ? v : undefined;
}

function slug(sp: SearchParams, key: string): string | undefined {
  const v = one(sp[key]);
  return v && SLUG.test(v) ? v : undefined;
}

export function parseChangesParams(sp: SearchParams): ChangesParams {
  const offsetRaw = Number(one(sp.offset));
  const p: ChangesParams = {
    route: pickEnum(ROUTES, one(sp.route), 'flagged'),
    days: pickNum(DAYS, one(sp.days), 30),
    offset: Number.isInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 5000 ? offsetRaw : 0,
    tab: pickEnum(TABS, one(sp.tab), 'side'),
  };
  const competitor = id(sp, 'competitor');
  const type = slug(sp, 'type');
  const service = slug(sp, 'service');
  const q = one(sp.q)?.slice(0, 100);
  const event = id(sp, 'event');
  const change = id(sp, 'change');
  if (competitor) p.competitor = competitor;
  if (type) p.type = type;
  if (service) p.service = service;
  if (q) p.q = q;
  if (event) p.event = event;
  if (change) p.change = change;
  return p;
}

/** Stable key order for `changesHref`'s query string. */
const ORDER: (keyof ChangesParams)[] = ['competitor', 'type', 'service', 'route', 'days', 'q', 'offset', 'event', 'change', 'tab'];
const DEFAULTS: Partial<ChangesParams> = { route: 'flagged', days: 30, offset: 0, tab: 'side' };

/** Builds a `/c/<clientId>/changes` URL, omitting any value that equals its default (and any undefined/empty one). */
export function changesHref(clientId: string, p: Partial<ChangesParams>): string {
  const qs = new URLSearchParams();
  for (const key of ORDER) {
    const value = p[key];
    if (value === undefined || value === '') continue;
    if (DEFAULTS[key] !== undefined && DEFAULTS[key] === value) continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return `/c/${clientId}/changes${s ? `?${s}` : ''}`;
}

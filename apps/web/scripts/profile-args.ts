import { parseArgs } from 'node:util';

export interface ProfileArgs {
  /** Server origin, no trailing slash. */
  base: string;
  /** A Playwright storage-state JSON or a raw Cookie header; null = the E2E admin's storage state. */
  cookie: string | null;
  /** Exit 1 when any page has more sequential tool stages than this (spec D7). */
  assertStages: number | null;
  /** Exit 1 when any page has more sequential DB stages (shell included) than this; off by default. */
  assertDbStages: number | null;
  /** Exit 1 when any route could not be resolved (so was never profiled). */
  strictRoutes: boolean;
  /** Route-param overrides (`--param clientId=<uuid>`, or one route's param: `--param /kb/[id]=<uuid>`), used instead of ids found by crawling. */
  params: Record<string, string>;
  /** Fill the four uncrawlable route params from the E2E seed (`TEST_SERVICE_DATABASE_URL`); `--param` still wins. */
  paramsFromSeed: boolean;
  /** Also write the per-page rows (`ReportRow[]`) to this JSON file. */
  json: string | null;
}

/** One measured page in `--json` output (launch-gate D5: only `dbStages` is asserted). */
export interface ReportRow {
  route: string;
  path: string;
  status: number;
  wallMs: number;
  dbStages: number;
  authStages: number;
  txStages: number;
}

export const PROFILE_USAGE = `Usage: pnpm --filter @cs/web profile:pages [--base URL] [--cookie FILE] [--assert-stages N] [--assert-db-stages N] [--strict-routes] [--param name=value]... [--params-from-seed] [--json FILE]
  --base URL           server to profile (default http://localhost:$E2E_PORT, port 3100 when unset); it must run with PROFILE_TOOLS=1
                       for per-tool timings (a server without it gives page times only)
  --cookie FILE        Playwright storage-state JSON or a raw Cookie header (default: the E2E admin's storage state,
                       signing in once if it is missing)
  --assert-stages N    exit 1 when any page renders with more than N sequential tool stages (spec D7: 4)
  --assert-db-stages N exit 1 when any page makes more than N sequential app (drizzle) DB stages (shell included;
                       Better Auth and BEGIN/COMMIT stages are reported, never asserted)
  --strict-routes      exit 1 when any coverage route could not be resolved (and so was not profiled)
  --param name=value   use this id for a route param (e.g. clientId, or /kb/[id] for one route's param) instead of the
                       first one found by crawling
  --params-from-seed   take clientId, the Ask thread ids, reportId and the kb article id from the E2E seed (read via
                       TEST_SERVICE_DATABASE_URL, or PROFILE_SEED_DATABASE_URL); --param still overrides
  --json FILE          also write the per-page rows (route, path, status, wallMs, dbStages, authStages, txStages)`;

export function parseProfileArgs(argv: string[], env: Record<string, string | undefined>): ProfileArgs | { error: string } {
  let values: { base?: string; cookie?: string; 'assert-stages'?: string; 'assert-db-stages'?: string; 'strict-routes'?: boolean; param?: string[]; 'params-from-seed'?: boolean; json?: string };
  try {
    ({ values } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: { base: { type: 'string' }, cookie: { type: 'string' }, 'assert-stages': { type: 'string' }, 'assert-db-stages': { type: 'string' }, 'strict-routes': { type: 'boolean' }, param: { type: 'string', multiple: true }, 'params-from-seed': { type: 'boolean' }, json: { type: 'string' } },
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const base = (values.base ?? `http://localhost:${env.E2E_PORT?.trim() || '3100'}`).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(base)) return { error: '--base must be an http(s) origin, e.g. https://rivalmonday.app' };
  const stagesOpt = (flag: 'assert-stages' | 'assert-db-stages'): number | null | { error: string } => {
    if (values[flag] === undefined) return null;
    const n = Number(values[flag]);
    return Number.isInteger(n) && n >= 1 ? n : { error: `--${flag} must be a whole number ≥ 1` };
  };
  const assertStages = stagesOpt('assert-stages');
  if (assertStages !== null && typeof assertStages === 'object') return assertStages;
  const assertDbStages = stagesOpt('assert-db-stages');
  if (assertDbStages !== null && typeof assertDbStages === 'object') return assertDbStages;
  const params: Record<string, string> = {};
  for (const p of values.param ?? []) {
    const m = /^([\w/[\]-]+)=(.+)$/.exec(p);
    if (!m) return { error: `--param must be name=value (got "${p}")` };
    params[m[1]!] = m[2]!;
  }
  return { base, cookie: values.cookie ?? null, assertStages, assertDbStages, strictRoutes: values['strict-routes'] === true, params, paramsFromSeed: values['params-from-seed'] === true, json: values.json ?? null };
}

/** `/c/[clientId]/briefs/[briefId]` → a whole-path regex with one named group per param. */
export function routePattern(route: string): RegExp {
  const body = route.split('/').map((seg) => {
    const m = /^\[(\w+)\]$/.exec(seg);
    return m ? `(?<${m[1]}>[^/?#]+)` : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return new RegExp(`^${body}$`);
}

/** The concrete path when every param is known, else null. */
export function fillKnownParams(route: string, known: Record<string, string>): string | null {
  let missing = false;
  const path = route.replace(/\[(\w+)\]/g, (_, name: string) => {
    const v = known[name];
    if (v === undefined) missing = true;
    return encodeURIComponent(v ?? '');
  });
  return missing ? null : path;
}

/** A Cookie header for `host` from a Playwright storage state, or a raw header passed through. */
export function cookieHeaderFrom(text: string, host: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const state = JSON.parse(trimmed) as { cookies?: { name: string; value: string; domain: string }[] };
    const forHost = (domain: string) => {
      const d = domain.replace(/^\./, '');
      return host === d || host.endsWith(`.${d}`);
    };
    return (state.cookies ?? []).filter((c) => forHost(c.domain)).map((c) => `${c.name}=${c.value}`).join('; ');
  }
  return trimmed.replace(/^cookie:\s*/i, '');
}

const isDynamic = (seg: string) => /^\[\w+\]$/.test(seg);

/**
 * True when a captured id is really a literal route beside the dynamic one (`/platform/knowledge/new` for
 * `/platform/knowledge/[id]`): such a link must never fill the id. Prefixes match segment by segment, any dynamic
 * segment standing for any other (`[clientId]` ≡ `[id]`).
 */
export function fillsStaticSibling(route: string, values: Record<string, string>, allRoutes: readonly string[]): boolean {
  const segs = route.split('/');
  const others = allRoutes.map((r) => r.split('/'));
  return segs.some((seg, i) => {
    const name = /^\[(\w+)\]$/.exec(seg)?.[1];
    if (!name || values[name] === undefined) return false;
    return others.some((rs) => rs.length > i && rs[i] === values[name] && !isDynamic(rs[i]!)
      && rs.slice(0, i).every((s, j) => s === segs[j] || (isDynamic(s) && isDynamic(segs[j]!))));
  });
}

/** An `src/app` folder holding a `page.tsx` → its route (groups dropped); null for private (`_x`) or parallel (`@x`) folders. */
export function routeOfPageDir(dir: string): string | null {
  const segs = dir.split(/[\/]/).filter(Boolean);
  if (segs.some((s) => s.startsWith('_') || s.startsWith('@'))) return null;
  return `/${segs.filter((s) => !/^\(.*\)$/.test(s)).join('/')}`;
}

/** Warm visits measured per page; the report takes the median of each metric (launch-gate fix round 1: timing noise). */
export const WARM_VISITS = 3;

/** The middle value (lower middle for an even count), 0 for none. */
export function medianOf(xs: readonly number[]): number {
  if (!xs.length) return 0;
  return [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]!;
}

type VisitMetrics = { dbStages: number; authStages: number; txStages: number; wallMs: number };

/** Each metric's own median over a page's warm visits, plus the visit at the median `dbStages` (for per-query detail). */
export function medianVisit<V extends VisitMetrics>(visits: readonly V[]): VisitMetrics & { detail: V } {
  const pick = (k: keyof VisitMetrics) => medianOf(visits.map((v) => v[k]));
  const dbStages = pick('dbStages');
  return { dbStages, authStages: pick('authStages'), txStages: pick('txStages'), wallMs: pick('wallMs'), detail: visits.find((v) => v.dbStages === dbStages)! };
}

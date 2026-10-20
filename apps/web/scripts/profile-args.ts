import { parseArgs } from 'node:util';

export interface ProfileArgs {
  /** Server origin, no trailing slash. */
  base: string;
  /** A Playwright storage-state JSON or a raw Cookie header; null = the E2E admin's storage state. */
  cookie: string | null;
  /** Exit 1 when any page has more sequential stages than this. */
  assertStages: number | null;
  /** Route-param overrides (`--param clientId=<uuid>`, or one route's param: `--param /kb/[id]=<uuid>`), used instead of ids found by crawling. */
  params: Record<string, string>;
}

export const PROFILE_USAGE = `Usage: pnpm --filter @cs/web profile:pages [--base URL] [--cookie FILE] [--assert-stages N] [--param name=value]...
  --base URL           server to profile (default http://localhost:$E2E_PORT, port 3100 when unset); it must run with PROFILE_TOOLS=1
                       for per-tool timings (a server without it gives page times only)
  --cookie FILE        Playwright storage-state JSON or a raw Cookie header (default: the E2E admin's storage state,
                       signing in once if it is missing)
  --assert-stages N    exit 1 when any page renders with more than N sequential tool stages (spec D7: 4)
  --param name=value   use this id for a route param (e.g. clientId, or /kb/[id] for one route's param) instead of the
                       first one found by crawling`;

export function parseProfileArgs(argv: string[], env: Record<string, string | undefined>): ProfileArgs | { error: string } {
  let values: { base?: string; cookie?: string; 'assert-stages'?: string; param?: string[] };
  try {
    ({ values } = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: { base: { type: 'string' }, cookie: { type: 'string' }, 'assert-stages': { type: 'string' }, param: { type: 'string', multiple: true } },
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const base = (values.base ?? `http://localhost:${env.E2E_PORT?.trim() || '3100'}`).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(base)) return { error: '--base must be an http(s) origin, e.g. https://rivalmonday.app' };
  let assertStages: number | null = null;
  if (values['assert-stages'] !== undefined) {
    assertStages = Number(values['assert-stages']);
    if (!Number.isInteger(assertStages) || assertStages < 1) return { error: '--assert-stages must be a whole number ≥ 1' };
  }
  const params: Record<string, string> = {};
  for (const p of values.param ?? []) {
    const m = /^([\w/[\]-]+)=(.+)$/.exec(p);
    if (!m) return { error: `--param must be name=value (got "${p}")` };
    params[m[1]!] = m[2]!;
  }
  return { base, cookie: values.cookie ?? null, assertStages, params };
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

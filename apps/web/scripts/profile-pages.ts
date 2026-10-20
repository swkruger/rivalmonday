/**
 * Phase 7a1 Task 9 (spec D7): server time and sequential tool stages for every coverage screen.
 *
 *   PROFILE_TOOLS=1 next start …   (see the work file for the local recipe)
 *   pnpm --filter @cs/web profile:pages [--base URL] [--cookie FILE] [--assert-stages 4] [--param clientId=<uuid>]
 *
 * Routes come from `@cs/demo` `SCREENS` (one visit per base route). Route params are resolved by crawling as the
 * signed-in user: a route's first matching link on an already-visited page gives its ids (or `--param` overrides),
 * so the same run works on the E2E seed, the demo set or production. Each page is visited once to discover links
 * and once more, warm, to measure (request → full HTML). With a local server running `PROFILE_TOOLS=1`, the tool
 * timings in `.profile/tools.ndjson` are joined to each measured request by `x-rm-path` and time window.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseRoute, SCREENS } from '@cs/demo';
import { nowMs, sequentialStages, type ToolTiming } from '../src/server/tool-timing';
import { cookieHeaderFrom, fillKnownParams, parseProfileArgs, type ProfileArgs, PROFILE_USAGE, routePattern } from './profile-args';

const parsed = parseProfileArgs(process.argv.slice(2), process.env);
if ('error' in parsed) {
  console.error(`${parsed.error}\n\n${PROFILE_USAGE}`);
  process.exit(2);
}
const args: ProfileArgs = parsed;

const PROFILE_DIR = join(process.cwd(), '.profile');
const TOOLS_FILE = join(PROFILE_DIR, 'tools.ndjson');
const host = new URL(args.base).hostname;

async function cookieHeader(): Promise<string> {
  if (args.cookie) return cookieHeaderFrom(readFileSync(args.cookie, 'utf8'), host);
  // Default: the E2E admin's shared storage state (`e2e/admin-session.ts`), signing in once if it is missing.
  const { ADMIN_STATE, ensureAdminState } = await import('../e2e/admin-session');
  if (!existsSync(ADMIN_STATE)) {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    try {
      await ensureAdminState(browser, { project: { use: { baseURL: args.base } } } as never);
    } finally {
      await browser.close();
    }
  }
  return cookieHeaderFrom(readFileSync(ADMIN_STATE, 'utf8'), host);
}

interface Visit { path: string; status: number; ms: number; startMs: number; endMs: number; html: string }

async function visit(path: string, cookie: string): Promise<Visit> {
  const startMs = nowMs();
  const res = await fetch(`${args.base}${path}`, { headers: { cookie }, redirect: 'manual' });
  const html = await res.text();
  const endMs = nowMs();
  return { path, status: res.status, ms: endMs - startMs, startMs, endMs, html };
}

/** In-app link paths (no query or hash) found in a page. */
function linksIn(html: string): string[] {
  return [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&').split(/[?#]/)[0]!);
}

const cookie = await cookieHeader();
if (!cookie) {
  console.error(`No cookie for ${host}: pass --cookie FILE (a storage state or a raw Cookie header).`);
  process.exit(2);
}

// --- Discovery: visit what can be visited, learn ids from links, repeat until nothing new resolves. ---
const routes = [...new Set(SCREENS.map((s) => baseRoute(s.route)))];
/**
 * Chosen ids, keyed by param: `clientId` is one id for every `/c/` route (one client throughout); any other param is
 * keyed by the route prefix that owns it (`/platform/agencies/[id]` and `/kb/[id]` are different things; a prospect
 * is not the workspace client). `--param` may name either the param or that key.
 */
const known: Record<string, string> = {};
const keyOf = (route: string, name: string) => (name === 'clientId' && route.startsWith('/c/') ? name : route.slice(0, route.indexOf(`[${name}]`) + name.length + 2));
const paramsFor = (route: string) => {
  const out: Record<string, string> = {};
  for (const [, name] of route.matchAll(/\[(\w+)\]/g)) {
    const v = args.params[keyOf(route, name!)] ?? args.params[name!] ?? known[keyOf(route, name!)];
    if (v !== undefined) out[name!] = v;
  }
  return out;
};
const resolved = new Map<string, string>(); // route -> concrete path
const learn = (html: string) => {
  for (const link of linksIn(html)) {
    for (const route of routes) {
      if (!route.includes('[')) continue;
      const m = routePattern(route).exec(link);
      if (!m?.groups) continue;
      const have = paramsFor(route);
      // Only adopt a link that agrees with the ids already chosen.
      if (Object.entries(m.groups).some(([k, v]) => have[k] !== undefined && have[k] !== decodeURIComponent(v))) continue;
      for (const [k, v] of Object.entries(m.groups)) known[keyOf(route, k)] ??= decodeURIComponent(v);
    }
  }
};
for (let progress = true; progress;) {
  progress = false;
  for (const route of routes) {
    if (resolved.has(route)) continue;
    const path = fillKnownParams(route, paramsFor(route));
    if (!path) continue;
    resolved.set(route, path);
    progress = true;
    learn((await visit(path, cookie)).html);
  }
}
const unresolved = routes.filter((r) => !resolved.has(r));

// --- Measurement: one warm visit per resolved route, sequentially. ---
const measuredFrom = nowMs();
const visits: (Visit & { route: string })[] = [];
for (const [route, path] of resolved) visits.push({ ...(await visit(path, cookie)), route });

const timings: ToolTiming[] = existsSync(TOOLS_FILE)
  ? readFileSync(TOOLS_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as ToolTiming).filter((t) => t.startMs >= measuredFrom - 1)
  : [];
const SLACK_MS = 5; // the server's clock reading and ours differ by microseconds; allow a little either side
const rows = visits.map((v) => {
  const tools = timings.filter((t) => t.path === v.path && t.startMs >= v.startMs - SLACK_MS && t.endMs <= v.endMs + SLACK_MS).sort((a, b) => a.startMs - b.startMs);
  return {
    route: v.route, path: v.path, status: v.status, ms: Math.round(v.ms), stages: sequentialStages(tools),
    tools: tools.map((t) => ({ tool: t.tool, ms: Math.round(t.endMs - t.startMs), atMs: Math.round(t.startMs - v.startMs) })),
  };
}).sort((a, b) => b.ms - a.ms);

const p75 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.75) - 1]! : 0);
const workspace = rows.filter((r) => r.route.startsWith('/agency') || r.route.startsWith('/c/'));
mkdirSync(PROFILE_DIR, { recursive: true });
writeFileSync(join(PROFILE_DIR, 'report.json'), JSON.stringify({ base: args.base, at: new Date().toISOString(), rows, unresolved }, null, 2));

console.log(`Profiled ${rows.length} pages on ${args.base} (${timings.length} tool timings${timings.length ? '' : ' — is the server running with PROFILE_TOOLS=1?'})`);
console.log(`Agency/workspace p75 ${p75(workspace.map((r) => r.ms))} ms; slowest page ${rows[0]?.ms ?? 0} ms; max stages ${Math.max(0, ...rows.map((r) => r.stages))}\n`);
console.log('Slowest 15 (ms · stages · status · tools as name:ms@start):');
for (const r of rows.slice(0, 15)) {
  console.log(`${String(r.ms).padStart(6)} ms  ${String(r.stages).padStart(2)} st  ${r.status}  ${r.route}`);
  if (r.tools.length) console.log(`        ${r.tools.map((t) => `${t.tool}:${t.ms}@${t.atMs}`).join('  ')}`);
}
if (unresolved.length) console.log(`\nNo link found for (not profiled): ${unresolved.join(', ')}`);
const bad = rows.filter((r) => r.status >= 500);
if (bad.length) console.log(`\nServer errors: ${bad.map((r) => `${r.status} ${r.path}`).join(', ')}`);

if (args.assertStages !== null) {
  const over = rows.filter((r) => r.stages > args.assertStages!);
  if (timings.length === 0) {
    console.error('\n--assert-stages needs tool timings: run the server with PROFILE_TOOLS=1 on this machine.');
    process.exit(1);
  }
  if (over.length || bad.length) {
    console.error(`\nOver ${args.assertStages} stages: ${over.map((r) => `${r.route} (${r.stages})`).join(', ') || 'none'}`);
    process.exit(1);
  }
  console.log(`\nEvery page renders in ≤ ${args.assertStages} sequential stages.`);
}

/**
 * Phase 7a1 Task 9 (spec D7): server time and sequential tool stages for every coverage screen.
 *
 *   PROFILE_TOOLS=1 next start …   (see the work file for the local recipe)
 *   pnpm --filter @cs/web profile:pages [--base URL] [--cookie FILE] [--assert-stages 4] [--param clientId=<uuid>]
 *   bash apps/web/scripts/profile-gate.sh   (launch gate: build, start, --params-from-seed --assert-db-stages 8)
 *
 * Routes come from `@cs/demo` `SCREENS` (one visit per base route). Route params are resolved by crawling as the
 * signed-in user: a route's first matching link on an already-visited page gives its ids (or `--param` overrides,
 * or `--params-from-seed`), so the same run works on the E2E seed, the demo set or production. Each page is visited
 * once to discover links and once more, warm, to measure (request → full HTML). With a local server running
 * `PROFILE_TOOLS=1`, the timings in `.profile/tools.ndjson` are joined to each measured request by `x-rm-path` and
 * time window. Launch-gate D5: `dbStages` counts app (drizzle) spans only; Better Auth (`authStages`) and
 * BEGIN/COMMIT or tagged `sql` (`txStages`) spans are reported in their own columns, never asserted.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { FEATURES } from '@cs/core';
import { baseRoute, SCREENS } from '@cs/demo';
import postgres from 'postgres';
import { dbStageCounts, nowMs, sequentialStages, type ToolTiming } from '../src/server/tool-timing';
import { cookieHeaderFrom, fillKnownParams, fillsStaticSibling, medianOf, medianVisit, parseProfileArgs, type ProfileArgs, PROFILE_USAGE, type ReportRow, routeOfPageDir, routePattern, WARM_VISITS } from './profile-args';

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

/** The E2E admin (`e2e/seed.ts`); `PROFILE_SEED_ADMIN_EMAIL` overrides it for another seed. */
const SEED_ADMIN = process.env.PROFILE_SEED_ADMIN_EMAIL?.trim() || 'admin@e2e.test';

/**
 * `--params-from-seed`: deterministic ids for the routes no crawl reaches, keyed like `--param` (`clientId` for every
 * `/c/` route; other params by their route prefix). Read-only, on the service URL. A param with no reachable row stays
 * unset, so its route is listed as not profiled.
 */
async function seedParams(): Promise<{ params: Record<string, string>; missing: string[]; client: { name: string; missingFeatures: string[] } | null }> {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'));
  } catch {
    // optional: the gate passes the URLs in the environment
  }
  const url = process.env.PROFILE_SEED_DATABASE_URL?.trim() || process.env.TEST_SERVICE_DATABASE_URL?.trim();
  if (!url) throw new Error('--params-from-seed needs TEST_SERVICE_DATABASE_URL (or PROFILE_SEED_DATABASE_URL)');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const one = async (q: Promise<{ id: string }[]>) => (await q)[0]?.id;
    // The admin's agency: its own membership once it has signed in, else the seed's invitation.
    const agencyId = await one(sql<{ id: string }[]>`
      select agency_id as id from (
        select m.agency_id, 0 as pri, m.created_at from membership m join auth."user" u on u.id = m.user_id
          where lower(u.email) = lower(${SEED_ADMIN}) and m.client_id is null
        union all
        select i.agency_id, 1, i.created_at from invitation i
          where lower(i.email) = lower(${SEED_ADMIN}) and i.client_id is null and i.revoked_at is null
      ) x order by pri, created_at limit 1`);
    const userId = await one(sql<{ id: string }[]>`select id from auth."user" where lower(email) = lower(${SEED_ADMIN}) limit 1`);
    // The agency's active client with the most of `FEATURES` enabled (ideally all, so feature-gated pages render), the
    // oldest on a tie. Any feature it still lacks is reported, never patched into the seed.
    const all = [...FEATURES] as string[];
    const [best] = agencyId
      ? await sql<{ id: string; name: string; features: string[] }[]>`
          select id, name, features from client where agency_id = ${agencyId} and status = 'active' and archived_at is null
          order by (select count(*) from jsonb_array_elements_text(features) f where f = any(${all}::text[])) desc, created_at, id limit 1`
      : [];
    const clientId = best?.id;
    const missingFeatures = best ? all.filter((f) => !best.features.includes(f)) : [];
    // Client Ask threads are author-only (`get_my_ask_thread`): only the admin's own thread on that client opens.
    const clientThread = clientId && userId
      ? await one(sql<{ id: string }[]>`select id from ask_thread where client_id = ${clientId} and user_id = ${userId} and deleted_at is null order by created_at, id limit 1`)
      : undefined;
    // `/platform/ask` lists reviewable threads newest first (`listReviewableAskThreads`): its first row.
    const platformThread = await one(sql<{ id: string }[]>`
      select t.id from ask_thread t
        join client c on c.id = t.client_id and c.agency_id = t.agency_id
        join agency a on a.id = t.agency_id
      where c.ask_review_allowed and c.archived_at is null and a.archived_at is null
      order by t.created_at desc, t.id limit 1`);
    const reportId = clientId
      ? await one(sql<{ id: string }[]>`select id from trend_report where client_id = ${clientId} order by period_start desc, id limit 1`)
      : undefined;
    // A published platform article an agency admin may read (the audience rule of `get_kb_article`).
    const kbId = await one(sql<{ id: string }[]>`
      select id from kb_article where level = 'platform' and status = 'published' and audience in ('all', 'agency')
      order by seed_key nulls last, id limit 1`);
    const found: Record<string, string | undefined> = {
      clientId, '/c/[clientId]/ask/[threadId]': clientThread, '/platform/ask/[threadId]': platformThread,
      '/c/[clientId]/reports/[reportId]': reportId, '/kb/[id]': kbId,
    };
    const params = Object.fromEntries(Object.entries(found).filter((e): e is [string, string] => e[1] !== undefined));
    return { params, missing: Object.keys(found).filter((k) => found[k] === undefined), client: best ? { name: best.name, missingFeatures } : null };
  } finally {
    await sql.end();
  }
}

/** Every page route in `src/app` (groups dropped), so literal siblings such as `/agency/prospects/new` are known. */
function appRoutes(): string[] {
  const appDir = resolve(import.meta.dirname, '../src/app');
  const out: string[] = [];
  const walk = (rel: string) => {
    const entries = readdirSync(join(appDir, rel), { withFileTypes: true });
    if (entries.some((e) => e.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(e.name))) {
      const r = routeOfPageDir(rel);
      if (r) out.push(r);
    }
    for (const e of entries) if (e.isDirectory()) walk(rel ? `${rel}/${e.name}` : e.name);
  };
  if (existsSync(appDir)) walk('');
  return out;
}

interface Visit { path: string; status: number; ms: number; startMs: number; endMs: number; html: string; location: string | null }

async function visit(path: string, cookie: string): Promise<Visit> {
  const startMs = nowMs();
  const res = await fetch(`${args.base}${path}`, { headers: { cookie }, redirect: 'manual' });
  const html = await res.text();
  const endMs = nowMs();
  return { path, status: res.status, ms: endMs - startMs, startMs, endMs, html, location: res.headers.get('location') };
}

/** In-app link paths (no query or hash) found in a page. */
function linksIn(html: string): string[] {
  return [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&').split(/[?#]/)[0]!);
}

/** Exit codes: 0 ok, 1 an assertion failed, 2 a usage/session problem. Returned, not `process.exit`ed: exiting with
 * fetch sockets still open trips a libuv assertion on Windows. */
async function main(): Promise<number> {
  const cookie = await cookieHeader();
  if (!cookie) {
    console.error(`No cookie for ${host}: pass --cookie FILE (a storage state or a raw Cookie header).`);
    return 2;
  }
  // After the cookie: signing in turns the seed's invitation into the admin's membership.
  let seeded: Record<string, string> = {};
  if (args.paramsFromSeed) {
    const s = await seedParams();
    seeded = s.params;
    console.log(`Seed params (${SEED_ADMIN}): ${Object.entries(seeded).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
    if (s.missing.length) console.log(`  not in the seed (left to the crawl): ${s.missing.join(', ')}`);
    if (s.client) console.log(`  client: ${s.client.name}${s.client.missingFeatures.length ? ` — no seeded client of the agency has every feature; this one lacks: ${s.client.missingFeatures.join(', ')}` : ' (every feature on)'}`);
  }

  // --- Discovery: visit what can be visited, learn ids from links, repeat until nothing new resolves. ---
  const routes = [...new Set(SCREENS.map((s) => baseRoute(s.route)))];
  const allRoutes = [...new Set([...routes, ...appRoutes()])];
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
      // Seed ids are keyed per route ('clientId' = the /c/ routes only), so a prospect never borrows the workspace client.
      const key = keyOf(route, name!);
      const v = args.params[key] ?? args.params[name!] ?? seeded[key] ?? known[key];
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
        const ids = Object.fromEntries(Object.entries(m.groups).map(([k, v]) => [k, decodeURIComponent(v)]));
        // `/platform/knowledge/new` is its own page, never the `[id]` of `/platform/knowledge/[id]`.
        if (fillsStaticSibling(route, ids, allRoutes)) continue;
        for (const [k, v] of Object.entries(ids)) known[keyOf(route, k)] ??= v;
      }
    }
  };
  // A cookie the server does not accept (expired session, reset database) sends every page to sign-in: say so and stop.
  const probe = await visit(fillKnownParams(routes[0]!, {}) ?? '/agency', cookie);
  if (probe.location?.includes('/sign-in')) {
    console.error(`${probe.path} redirects to sign-in: the session cookie is not accepted (expired, or the database was reset — delete the storage state and re-run).`);
    return 2;
  }
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

  // --- Measurement: WARM_VISITS warm visits per resolved route, reported as the median of each metric (span overlap is
  // timing-dependent, so one visit is noisy by about one stage). The visits MUST stay sequential: spans are joined to a visit by
  // path and by its time window (±SLACK_MS), so two overlapping visits of one path would share spans. ---
  const measuredFrom = nowMs();
  const visits: (Visit & { route: string })[] = [];
  for (const [route, path] of resolved) for (let i = 0; i < WARM_VISITS; i++) visits.push({ ...(await visit(path, cookie)), route });

  const timings: ToolTiming[] = existsSync(TOOLS_FILE)
    ? readFileSync(TOOLS_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as ToolTiming).filter((t) => t.startMs >= measuredFrom - 1)
    : [];
  const toolCount = timings.filter((t) => t.kind !== 'db').length;
  const dbCount = timings.length - toolCount;
  const SLACK_MS = 5; // the server's clock reading and ours differ by microseconds; allow a little either side
  const perVisit = visits.map((v) => {
    const mine = timings.filter((t) => t.path === v.path && t.startMs >= v.startMs - SLACK_MS && t.endMs <= v.endMs + SLACK_MS).sort((a, b) => a.startMs - b.startMs);
    const tools = mine.filter((t) => t.kind !== 'db');
    const queries = mine.filter((t) => t.kind === 'db');
    const counts = dbStageCounts(mine);
    return {
      route: v.route, path: v.path, status: v.status, wallMs: Math.round(v.ms),
      /** Spec D7 as asserted: sequential tool stages (layout + page tool calls). */
      stages: sequentialStages(tools),
      /** Launch-gate D5 (asserted): sequential app (drizzle) DB stages on the web pools, shell and direct reads included. */
      dbStages: counts.dbStages,
      /** Reported only: Better Auth's pool; BEGIN/COMMIT (savepoint/release) and tagged `sql` round trips. */
      authStages: counts.authStages,
      txStages: counts.txStages,
      queries: counts.queries,
      tools: tools.map((t) => ({ tool: t.tool, ms: Math.round(t.endMs - t.startMs), atMs: Math.round(t.startMs - v.startMs) })),
      /** report.json only: each query's label (`select client`), duration and start offset. */
      db: queries.map((t) => ({ query: t.tool, source: t.source ?? 'app', ms: Math.round((t.endMs - t.startMs) * 10) / 10, atMs: Math.round(t.startMs - v.startMs) })),
    };
  });
  const rows = [...resolved.keys()].map((route) => {
    const mine = perVisit.filter((r) => r.route === route);
    const m = medianVisit(mine);
    // Median of each metric; tools/db detail (and status) come from the visit at the median dbStages.
    return { ...m.detail, dbStages: m.dbStages, authStages: m.authStages, txStages: m.txStages, wallMs: m.wallMs, stages: medianOf(mine.map((r) => r.stages)), visitDbStages: mine.map((r) => r.dbStages) };
  }).sort((a, b) => b.wallMs - a.wallMs);

  const p75 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.75) - 1]! : 0);
  const max = (xs: number[]) => Math.max(0, ...xs);
  const workspace = rows.filter((r) => r.route.startsWith('/agency') || r.route.startsWith('/c/'));
  mkdirSync(PROFILE_DIR, { recursive: true });
  writeFileSync(join(PROFILE_DIR, 'report.json'), JSON.stringify({ base: args.base, at: new Date().toISOString(), rows, unresolved }, null, 2));
  if (args.json) {
    const out: ReportRow[] = [...rows]
      .sort((a, b) => b.dbStages - a.dbStages || a.route.localeCompare(b.route))
      .map((r) => ({ route: r.route, path: r.path, status: r.status, wallMs: r.wallMs, dbStages: r.dbStages, authStages: r.authStages, txStages: r.txStages }));
    mkdirSync(dirname(resolve(args.json)), { recursive: true });
    writeFileSync(resolve(args.json), JSON.stringify({ base: args.base, at: new Date().toISOString(), assertDbStages: args.assertDbStages, rows: out, unresolved }, null, 2));
  }

  console.log(`Profiled ${rows.length} of ${routes.length} routes on ${args.base}, ${WARM_VISITS} warm visits each, medians reported (${toolCount} tool timings, ${dbCount} DB timings${timings.length ? '' : ' — is the server running with PROFILE_TOOLS=1?'})`);
  console.log(`Agency/workspace p75 ${p75(workspace.map((r) => r.wallMs))} ms; slowest page ${rows[0]?.wallMs ?? 0} ms`);
  console.log(`Max sequential tool stages ${max(rows.map((r) => r.stages))}; max sequential DB stages (incl. shell) ${max(rows.map((r) => r.dbStages))}, median ${[...rows.map((r) => r.dbStages)].sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0}; max auth stages ${max(rows.map((r) => r.authStages))}, max tx stages ${max(rows.map((r) => r.txStages))} (reported, not asserted)\n`);
  console.log('Slowest 15 (ms · tool stages · DB stages/queries · auth stages · tx stages · status · tools as name:ms@start):');
  for (const r of rows.slice(0, 15)) {
    console.log(`${String(r.wallMs).padStart(6)} ms  ${String(r.stages).padStart(2)} tool st  ${String(r.dbStages).padStart(3)} db st/${r.queries} q  ${String(r.authStages).padStart(2)} auth  ${String(r.txStages).padStart(2)} tx  ${r.status}  ${r.route}`);
    if (r.tools.length) console.log(`        ${r.tools.map((t) => `${t.tool}:${t.ms}@${t.atMs}`).join('  ')}`);
  }
  if (args.json) {
    console.log('\nEvery page by DB stages (db · auth · tx · ms · status · route):');
    for (const r of [...rows].sort((a, b) => b.dbStages - a.dbStages || a.route.localeCompare(b.route))) {
      console.log(`${String(r.dbStages).padStart(3)} db  ${String(r.authStages).padStart(2)} auth  ${String(r.txStages).padStart(2)} tx  ${String(r.wallMs).padStart(6)} ms  ${r.status}  ${r.route}`);
    }
  }
  if (unresolved.length) console.log(`\nWARN ${unresolved.length} route(s) not profiled (no link found; pass --param): ${unresolved.join(', ')}`);
  const bad = rows.filter((r) => r.status >= 500);
  if (bad.length) console.log(`\nServer errors: ${bad.map((r) => `${r.status} ${r.path}`).join(', ')}`);

  let failed = false;
  const scope = unresolved.length ? `All ${rows.length} profiled pages (${unresolved.length} route(s) not profiled)` : 'Every page';
  if (args.assertStages !== null || args.assertDbStages !== null) {
    if (toolCount === 0) {
      console.error('\n--assert-stages/--assert-db-stages need timings: run the server with PROFILE_TOOLS=1 on this machine.');
      return 1;
    }
    if (bad.length) failed = true;
  }
  if (args.assertStages !== null) {
    const over = rows.filter((r) => r.stages > args.assertStages!);
    if (over.length) {
      console.error(`\nOver ${args.assertStages} tool stages: ${over.map((r) => `${r.route} (${r.stages})`).join(', ')}`);
      failed = true;
    } else console.log(`\n${scope}: ≤ ${args.assertStages} sequential tool stages.`);
  }
  if (args.assertDbStages !== null) {
    const over = rows.filter((r) => r.dbStages > args.assertDbStages!);
    if (dbCount === 0) {
      console.error('\n--assert-db-stages: no DB timings recorded (is the server built from this branch with PROFILE_TOOLS=1?).');
      failed = true;
    } else if (over.length) {
      console.error(`\nOver ${args.assertDbStages} DB stages: ${over.map((r) => `${r.route} (${r.dbStages})`).join(', ')}`);
      failed = true;
    } else console.log(`${scope}: ≤ ${args.assertDbStages} sequential DB stages.`);
  }
  if (args.strictRoutes && unresolved.length) {
    console.error(`\n--strict-routes: ${unresolved.length} route(s) not profiled.`);
    failed = true;
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();

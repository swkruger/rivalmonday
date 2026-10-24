/**
 * Phase 7c1: the registry-wide tenant-isolation harness (spec §5 "Isolation suite", plan Decisions 2–3).
 * Test-only: imported by `isolation.test.ts` / `harness.test.ts`, never by the package index.
 *
 * `runToolCases` invokes one tool through a real registry for every negative scenario of its fixture kind on every
 * channel the tool lists, plus the positive control, and classifies each call:
 *  - `refused`: rejected with `not_found` / `permission_denied` and the message carries nothing foreign;
 *  - `wrong_error`: any other rejection where a refusal is required, or a positive control refused / input-invalid;
 *  - `leak`: resolved where a refusal is required, or any resolved output that carries a forbidden canary / id;
 *  - `ok`: an allowed call that resolved clean (or a positive control rejected for a non-tenancy reason, see `detail`).
 *
 * Write tools (Task 4) also take a `WriteProbe`: each non-positive scenario is bracketed by `fingerprintA` (a refusal
 * must leave every A tenant unchanged; an allowed call must leave the user's forbidden A tenants unchanged), and a
 * refused call must make no `enqueue` and no billing-gateway call (an allowed call's jobs / gateway args must carry
 * nothing forbidden). The positive control may mutate: the suite reseeds the world before the next write tool.
 */
import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, type CallOptions, type Permission, ToolError, type ToolChannel, type ToolRegistry, type TokenScope } from '@cs/core';
import type { Db } from '@cs/db';
import { TABLE_CLASS, type IsolationWorld, type TenantKey, type WorldUser } from '@cs/db/test-helpers';
import { type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { EnqueueJob, ToolDeps } from '../deps';
import { dbs } from '../tools/workspace-fixtures';
import { type IsolationFixture, type IsolationTarget, VIEWER_WRITES } from './fixtures';

/** What a write tool's cases observe besides the result: the DB (owner connection) and the deps' side-effect spies. */
export interface WriteProbe { owner: Db; enqueued: unknown[]; gateway: FakeGateway; webhooks?: unknown[] }

export interface CaseResult { tool: string; scenario: string; channel: ToolChannel; outcome: 'refused' | 'ok' | 'wrong_error' | 'leak'; detail?: string }

/** The slice of a registered tool the harness needs (core's `AnyTool` is not exported). */
export interface AnyToolLike {
  name: string;
  access: 'read' | 'write';
  permission: Permission;
  channels?: readonly ToolChannel[];
  input: z.ZodType;
}

const MCP_TOKEN_ID = '00000000-0000-4000-8000-0000000007c1';
const REFUSAL_CODES = new Set(['not_found', 'permission_denied']);
const POSITIVE_FAILURE_CODES = new Set(['not_found', 'permission_denied', 'invalid_input']);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const CANARY = /CANARY-(A1|A2|B1|A|B|X|Y|Z)-\d+/g;

/** Deps for the isolation registry: every optional service present (fakes), so a refusal is never a missing-deps artefact. */
export function isolationDeps(w: IsolationWorld): { deps: ToolDeps; enqueued: unknown[]; gateway: FakeGateway; webhooks: unknown[] } {
  const enqueued: unknown[] = [];
  const webhooks: unknown[] = [];
  const gateway = fakeGateway();
  // `test_webhook` posts with this instead of the network
  const webhookFetch = (async (url: string | URL | Request) => {
    webhooks.push({ url: String(url) });
    return new Response('ok', { status: 200 });
  }) as typeof fetch;
  const enqueue: EnqueueJob = async (job, data, singletonKey) => {
    enqueued.push({ job, data, singletonKey });
  };
  const deps: ToolDeps = {
    app: dbs.app,
    service: dbs.service,
    enqueue,
    jobStatus: async () => null,
    queueStats: async () => ({ queues: [], lastHeartbeatAt: null }),
    billing: gateway,
    webMonitoring: true,
    kbImportEnabled: true,
    appUrl: 'https://app.example',
    delivery: { appUrl: 'https://app.example', linkSecrets: ['isolation-link-secret-0123456789abcdef'], fromAddress: 'briefs@app.example' },
    webhookFetch,
    platformAdmins: [],
    setupLookup: async () => [],
    evidenceStore: {
      async get(key) {
        const text = w.evidenceText.get(key);
        return text === undefined ? null : new TextEncoder().encode(text);
      },
      async put() {},
    },
  };
  return { deps, enqueued, gateway, webhooks };
}

/**
 * Teaches the fake billing gateway the world's Stripe objects (write tools only): each agency's connected account
 * (onboarded) and each client's connected subscription, so a positive control reaches Stripe-like success.
 */
export async function primeFakeStripe(gateway: FakeGateway, owner: Db): Promise<void> {
  const accounts = (await owner.execute(sql`SELECT stripe_account_id AS id FROM agency_connect WHERE stripe_account_id IS NOT NULL`)) as unknown as { id: string }[];
  for (const a of accounts) gateway.seedConnectedAccount({ id: a.id, chargesEnabled: true, detailsSubmitted: true });
  const subs = (await owner.execute(sql`
    SELECT cb.stripe_subscription_id AS id, cb.stripe_customer_id AS customer, cb.stripe_price_id AS price, cb.price_cents AS cents, ac.stripe_account_id AS acct
    FROM client_billing cb JOIN agency_connect ac ON ac.agency_id = cb.agency_id
    WHERE cb.stripe_subscription_id IS NOT NULL AND ac.stripe_account_id IS NOT NULL`)) as unknown as { id: string; customer: string; price: string; cents: number; acct: string }[];
  for (const s of subs) {
    gateway.seedConnectedPrice({ id: s.price, stripeAccount: s.acct, unitAmountCents: s.cents });
    gateway.seedConnectedSubscription({ id: s.id, stripeAccount: s.acct, customerId: s.customer, priceId: s.price, unitAmountCents: s.cents, status: 'active', cancelAtPeriodEnd: false });
  }
}

/**
 * The first forbidden canary phrase or tenant id found anywhere in `output` (string values and object keys, at any
 * depth; ids case-insensitive), as `"<hit> at <path>"`, or null. `except` lists ids allowed anyway (the call's input).
 */
export function findForeign(output: unknown, w: IsolationWorld, forbidden: TenantKey[], except?: ReadonlySet<string>): string | null {
  const bad = new Set(forbidden);
  const ids = new Map<string, TenantKey>();
  for (const t of forbidden) for (const id of w.idsOf(t)) ids.set(id.toLowerCase(), t);
  const allowed = new Set([...(except ?? [])].map((s) => s.toLowerCase()));
  const scan = (s: string, path: string): string | null => {
    for (const m of s.matchAll(CANARY)) if (bad.has(m[1] as TenantKey)) return `${m[0]} at ${path}`;
    for (const m of s.matchAll(UUID)) {
      const id = m[0].toLowerCase();
      if (ids.has(id) && !allowed.has(id)) return `${ids.get(id)} id ${id} at ${path}`;
    }
    return null;
  };
  const seen = new Set<unknown>();
  const walk = (v: unknown, path: string): string | null => {
    if (typeof v === 'string') return scan(v, path);
    if (v === null || typeof v !== 'object' || seen.has(v)) return null;
    seen.add(v);
    if (v instanceof Date) return null;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const hit = walk(v[i], `${path}[${i}]`);
        if (hit) return hit;
      }
      return null;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const hit = scan(k, `${path}{key}`) ?? walk(val, `${path}.${k}`);
      if (hit) return hit;
    }
    return null;
  };
  return walk(output, '$');
}

/** Tables a refused call legitimately writes: the audit trail (by design) and the MCP rate window. */
const FINGERPRINT_EXCLUDED = new Set(['audit_log', 'mcp_rate_window']);
/** Tenant tables with no agency_id/client_id column: A's rows are found through their parent row. */
const VIA_PARENT: Record<string, { parent: string; fk: string }> = {
  event_change: { parent: 'event', fk: 'event_id' },
  move_event: { parent: 'move', fk: 'move_id' },
  runbook_item: { parent: 'runbook', fk: 'runbook_id' },
  decision_label: { parent: 'decision_sample', fk: 'sample_id' },
  decision_review: { parent: 'decision_sample', fk: 'sample_id' },
};
let fingerprintSql: Promise<SQL> | undefined;

async function buildFingerprintSql(owner: Db, w: IsolationWorld): Promise<SQL> {
  const cols = (await owner.execute(sql`
    SELECT table_name AS t, bool_or(column_name = 'agency_id') AS a, bool_or(column_name = 'client_id') AS c
    FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('agency_id', 'client_id') GROUP BY 1`)) as unknown as { t: string; a: boolean; c: boolean }[];
  const tenantCols = new Map(cols.map((r) => [r.t, r]));
  const A = w.ids.agencyA;
  const A1 = w.ids.clientA1;
  const A2 = w.ids.clientA2;
  // `p` is the alias of the row holding the tenant columns (the table itself, or its parent).
  const tenantOf = (p: string, clientCol: string | null): SQL =>
    clientCol ? sql`CASE ${sql.raw(`${p}.${clientCol}`)} WHEN ${A1}::uuid THEN 'A1' WHEN ${A2}::uuid THEN 'A2' ELSE 'A' END` : sql`'A'`;
  const ofA = (p: string, a: boolean, clientCol: string | null): SQL => {
    const parts: SQL[] = [];
    if (a) parts.push(sql`${sql.raw(`${p}.agency_id`)} = ${A}::uuid`);
    if (clientCol) parts.push(sql`${sql.raw(`${p}.${clientCol}`)} IN (${A1}::uuid, ${A2}::uuid)`);
    return sql.join(parts, sql` OR `);
  };
  const selects: SQL[] = [];
  for (const [table, cls] of Object.entries(TABLE_CLASS).sort(([x], [y]) => x.localeCompare(y))) {
    if (FINGERPRINT_EXCLUDED.has(table)) continue;
    const tenantClass = cls === 'tenant_client' || cls === 'tenant_agency';
    if (!tenantClass && cls !== 'service_only') continue;
    const own = tenantCols.get(table);
    const via = VIA_PARENT[table];
    let from: SQL;
    let where: SQL;
    let tenant: SQL;
    if (table === 'agency') {
      from = sql`agency x`;
      where = sql`x.id = ${A}::uuid`;
      tenant = sql`'A'`;
    } else if (table === 'client') {
      from = sql`client x`;
      where = sql`x.agency_id = ${A}::uuid OR x.id IN (${A1}::uuid, ${A2}::uuid)`;
      tenant = tenantOf('x', 'id');
    } else if (own) {
      from = sql`${sql.identifier(table)} x`;
      where = ofA('x', own.a, own.c ? 'client_id' : null);
      tenant = tenantOf('x', own.c ? 'client_id' : null);
    } else if (via) {
      const pc = tenantCols.get(via.parent);
      if (!pc) throw new Error(`fingerprintA: parent ${via.parent} of ${table} has no tenant column`);
      from = sql`${sql.identifier(table)} x JOIN ${sql.identifier(via.parent)} p ON p.id = ${sql.raw(`x.${via.fk}`)}`;
      where = ofA('p', pc.a, pc.c ? 'client_id' : null);
      tenant = tenantOf('p', pc.c ? 'client_id' : null);
    } else {
      if (tenantClass) throw new Error(`fingerprintA: tenant table ${table} has no tenant column or parent mapping`);
      continue; // service_only without tenant rows (vendor/stage bookkeeping)
    }
    selects.push(sql`(SELECT ${table}::text AS t, ${tenant} AS k, md5(string_agg(to_jsonb(x)::text, ',' ORDER BY to_jsonb(x)::text)) AS h
      FROM ${from} WHERE ${where} GROUP BY 2)`);
  }
  return sql.join(selects, sql` UNION ALL `);
}

/**
 * Plan Decision 4 (ruling R5): per (table, A tenant) `md5` over A's rows (owner connection, bypasses RLS), keyed
 * `"<table>/<A|A1|A2>"`. Covers `tenant_client` / `tenant_agency` tables and `service_only` tables holding tenant rows
 * (an `agency_id`/`client_id` column, or a parent row that has one), minus `audit_log` and `mcp_rate_window`. A row
 * is A's when its agency is A or its client is A1/A2 (a row written under another agency naming an A client counts).
 */
export async function fingerprintA(owner: Db, w: IsolationWorld): Promise<Record<string, string>> {
  fingerprintSql ??= buildFingerprintSql(owner, w);
  const rows = (await owner.execute(await fingerprintSql)) as unknown as { t: string; k: string; h: string }[];
  return Object.fromEntries(rows.map((r) => [`${r.t}/${r.k}`, r.h]));
}

/** Keys whose hash differs (added, removed or changed) and whose tenant is in `tenants`. */
function changedKeys(before: Record<string, string>, after: Record<string, string>, tenants: ReadonlySet<string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => before[k] !== after[k] && tenants.has(k.slice(k.lastIndexOf('/') + 1)))
    .sort();
}

interface Scenario {
  name: string;
  user: WorldUser;
  input: unknown;
  /** `refuse`: must be refused; `allow`: may resolve (output clean) or be refused; `positive`: the control. */
  expect: 'refuse' | 'allow' | 'positive';
}

const TARGETS = (w: IsolationWorld): Record<'A1' | 'A2', IsolationTarget> => ({
  A1: { tenant: 'A1', agencyId: w.ids.agencyA, clientId: w.ids.clientA1 },
  A2: { tenant: 'A2', agencyId: w.ids.agencyA, clientId: w.ids.clientA2 },
});

function scenariosOf(w: IsolationWorld, tool: AnyToolLike, fx: IsolationFixture): Scenario[] {
  const t = TARGETS(w);
  switch (fx.kind) {
    case 'client':
    case 'object': {
      const out: Scenario[] = [
        { name: 'adminB→A1', user: 'adminB', input: fx.input(w, t.A1), expect: 'refuse' },
        { name: 'ownerA2→A1', user: 'ownerA2', input: fx.input(w, t.A1), expect: 'refuse' },
        { name: 'amA→A2', user: 'amA', input: fx.input(w, t.A2), expect: 'refuse' },
      ];
      // Decision 3: a viewer is refused every write that needs more than `read` (VIEWER_WRITES = reviewed exceptions).
      if (tool.access === 'write' && tool.permission !== 'read' && !VIEWER_WRITES.includes(tool.name)) {
        out.push({ name: 'viewerA1→A1', user: 'viewerA1', input: fx.input(w, t.A1), expect: 'refuse' });
      }
      const positiveAs = fx.positiveAs ?? 'adminA';
      out.push({ name: `positive:${positiveAs}→A1`, user: positiveAs, input: fx.input(w, t.A1), expect: 'positive' });
      return out;
    }
    case 'agency': {
      const input = fx.input(w);
      return [
        ...(['ownerA1', 'ownerA2', 'viewerA1'] as const).map((u): Scenario => ({ name: `${u}→A`, user: u, input, expect: 'refuse' })),
        { name: 'adminB→A', user: 'adminB', input, expect: 'allow' },
        { name: 'amA→A', user: 'amA', input, expect: 'allow' },
        { name: 'positive:adminA→A', user: 'adminA', input, expect: 'positive' },
      ];
    }
    case 'platform': {
      const input = fx.input?.(w) ?? {};
      return [
        ...(['adminA', 'adminB', 'amA', 'ownerA1', 'ownerA2', 'viewerA1'] as const).map((u): Scenario => ({ name: `${u}→platform`, user: u, input, expect: 'refuse' })),
        { name: 'positive:operator', user: 'operator', input, expect: 'positive' },
      ];
    }
    case 'caller': {
      const input = (user: WorldUser) => fx.input?.(w, user) ?? {};
      return [
        { name: 'adminB→caller', user: 'adminB', input: input('adminB'), expect: 'allow' },
        { name: 'ownerA2→caller', user: 'ownerA2', input: input('ownerA2'), expect: 'allow' },
        { name: 'positive:adminA→caller', user: 'adminA', input: input('adminA'), expect: 'positive' },
      ];
    }
  }
}

const ctxOf = (w: IsolationWorld, user: WorldUser): AccessContext => (user === 'operator' ? w.operatorCtx() : w.ctx(user));

function callOptions(channel: ToolChannel): CallOptions {
  return channel === 'mcp' ? { channel, tokenId: MCP_TOKEN_ID, tokenScope: 'manage' as TokenScope } : { channel };
}

function inputIds(input: unknown): Set<string> {
  let text = '';
  try {
    text = JSON.stringify(input) ?? '';
  } catch {
    text = '';
  }
  return new Set([...text.matchAll(UUID)].map((m) => m[0].toLowerCase()));
}

const errorCode = (err: unknown): string => (err instanceof ToolError ? err.code : 'untyped');
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const A_TENANTS: readonly TenantKey[] = ['A', 'A1', 'A2'];

/**
 * Runs every scenario of `fx` for `tool` on each of its channels (sequentially; reads share one seeded world). With a
 * `probe` (write tools) each non-positive scenario is also checked against `fingerprintA` and the side-effect spies.
 */
export async function runToolCases(registry: ToolRegistry<ToolDeps>, w: IsolationWorld, tool: AnyToolLike, fx: IsolationFixture, probe?: WriteProbe): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  const channels = tool.channels ?? ['web'];
  const skipPositive = 'skipPositive' in fx ? fx.skipPositive : undefined;
  for (const s of scenariosOf(w, tool, fx)) {
    if (s.expect === 'positive' && skipPositive) {
      const parsed = tool.input.safeParse(s.input);
      for (const channel of channels) {
        results.push(parsed.success
          ? { tool: tool.name, scenario: s.name, channel, outcome: 'ok', detail: `skipped: ${skipPositive}` }
          : { tool: tool.name, scenario: s.name, channel, outcome: 'wrong_error', detail: `skipPositive input does not parse: ${parsed.error.message}` });
      }
      continue;
    }
    const forbidden = w.forbidden(s.user);
    const before = probe && s.expect !== 'positive' ? await fingerprintA(probe.owner, w) : null;
    const scenarioStart = results.length;
    for (const channel of channels) {
      const base = { tool: tool.name, scenario: s.name, channel };
      const marks = probe ? { jobs: probe.enqueued.length, calls: probe.gateway.calls.length, posts: probe.webhooks?.length ?? 0 } : null;
      /** This call's side effects: none when refused; nothing forbidden when an allowed call resolved. */
      const sideEffects = (refused: boolean): string | null => {
        if (!probe || !marks || s.expect === 'positive') return null;
        const jobs = probe.enqueued.slice(marks.jobs);
        const calls = probe.gateway.calls.slice(marks.calls);
        const posts = probe.webhooks?.slice(marks.posts) ?? [];
        // A required refusal makes none at all; an allowed call (its own tenant) may, but they carry nothing forbidden.
        if (refused && s.expect === 'refuse') {
          const what = [
            jobs.length ? `enqueue ${JSON.stringify(jobs)}` : '', calls.length ? `gateway ${calls.map((c) => c.method).join(', ')}` : '', posts.length ? `webhook ${JSON.stringify(posts)}` : '',
          ].filter(Boolean);
          return what.length ? `refused call made side effects: ${what.join('; ')}` : null;
        }
        const hit = findForeign({ jobs, calls, posts }, w, forbidden);
        return hit ? `side effects carry ${hit}` : null;
      };
      let output: unknown;
      try {
        output = await registry.invoke(ctxOf(w, s.user), tool.name, s.input, callOptions(channel));
      } catch (err) {
        const code = errorCode(err);
        const message = errorMessage(err);
        if (s.expect === 'positive') {
          results.push(POSITIVE_FAILURE_CODES.has(code)
            ? { ...base, outcome: 'wrong_error', detail: `positive control rejected: ${code}: ${message}` }
            : { ...base, outcome: 'ok', detail: `rejected (not tenancy): ${code}: ${message}` });
          continue;
        }
        const effects = sideEffects(true);
        if (effects) {
          results.push({ ...base, outcome: 'leak', detail: `${code}: ${effects}` });
          continue;
        }
        if (!REFUSAL_CODES.has(code)) {
          results.push({ ...base, outcome: 'wrong_error', detail: `${code}: ${message}` });
          continue;
        }
        const hit = findForeign(message, w, forbidden, inputIds(s.input));
        results.push(hit ? { ...base, outcome: 'leak', detail: `refusal message carries ${hit}` } : { ...base, outcome: 'refused' });
        continue;
      }
      if (s.expect === 'refuse') {
        const hit = findForeign(output, w, forbidden);
        results.push({ ...base, outcome: 'leak', detail: `resolved where a refusal is required${hit ? `; output carries ${hit}` : ''}` });
        continue;
      }
      // Platform staff legitimately see every agency: the operator's control checks only that it ran.
      const hit = fx.kind === 'platform' ? null : findForeign(output, w, forbidden);
      const effects = s.expect === 'allow' ? sideEffects(false) : null;
      results.push(hit || effects ? { ...base, outcome: 'leak', detail: hit ? `output carries ${hit}` : effects! } : { ...base, outcome: 'ok' });
    }
    if (probe && before) {
      // A required refusal leaves every A tenant as it was; an allowed call leaves the user's forbidden A tenants.
      const guarded = new Set<string>(s.expect === 'refuse' ? A_TENANTS : A_TENANTS.filter((t) => forbidden.includes(t)));
      const changed = changedKeys(before, await fingerprintA(probe.owner, w), guarded);
      if (changed.length) {
        for (const r of results.slice(scenarioStart)) {
          r.outcome = 'leak';
          r.detail = `${r.detail ? `${r.detail}; ` : ''}changed A rows: ${changed.join(', ')}`;
        }
      }
    }
  }
  return results;
}

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
 */
import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, type CallOptions, type Permission, ToolError, type ToolChannel, type ToolRegistry, type TokenScope } from '@cs/core';
import type { IsolationWorld, TenantKey, WorldUser } from '@cs/db/test-helpers';
import type { z } from 'zod';
import type { EnqueueJob, ToolDeps } from '../deps';
import { dbs } from '../tools/workspace-fixtures';
import { type IsolationFixture, type IsolationTarget, VIEWER_WRITES } from './fixtures';

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
export function isolationDeps(w: IsolationWorld): { deps: ToolDeps; enqueued: unknown[]; gateway: FakeGateway } {
  const enqueued: unknown[] = [];
  const gateway = fakeGateway();
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
  return { deps, enqueued, gateway };
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
      out.push({ name: 'positive:adminA→A1', user: 'adminA', input: fx.input(w, t.A1), expect: 'positive' });
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
      const input = fx.input?.(w) ?? {};
      return [
        { name: 'adminB→caller', user: 'adminB', input, expect: 'allow' },
        { name: 'ownerA2→caller', user: 'ownerA2', input, expect: 'allow' },
        { name: 'positive:adminA→caller', user: 'adminA', input, expect: 'positive' },
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

/** Runs every scenario of `fx` for `tool` on each of its channels (sequentially; reads share one seeded world). */
export async function runToolCases(registry: ToolRegistry<ToolDeps>, w: IsolationWorld, tool: AnyToolLike, fx: IsolationFixture): Promise<CaseResult[]> {
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
    for (const channel of channels) {
      const base = { tool: tool.name, scenario: s.name, channel };
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
      results.push(hit ? { ...base, outcome: 'leak', detail: `output carries ${hit}` } : { ...base, outcome: 'ok' });
    }
  }
  return results;
}

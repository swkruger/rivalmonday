/**
 * Phase 7c1: the registry-wide tenant-isolation suite (spec §5, plan Decisions 1–4) over every registered tool. Reads
 * share one seeded isolation world; each write tool gets a freshly reseeded world (its positive control may mutate)
 * and is checked against `fingerprintA` and the enqueue / billing-gateway spies. A failing negative case is a leak —
 * fix the tool, never the fixture.
 */
import { ToolError } from '@cs/core';
import { createAuditSink } from '@cs/db';
import { type IsolationWorld, seedIsolationWorld, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CaseResult, isolationDeps, primeFakeStripe, runToolCases } from './isolation/harness';
import { ISOLATION_FIXTURES, type IsolationFixture, type IsolationTarget, VIEWER_WRITES } from './isolation/fixtures';
import { createToolRegistry } from './registry';
import { allTools } from './tools/all';
import { dbs } from './tools/workspace-fixtures';

let w: IsolationWorld;
let registry: ReturnType<typeof createToolRegistry>;

beforeAll(async () => {
  await truncateAll(dbs.owner);
  w = await seedIsolationWorld(dbs.owner);
  registry = createToolRegistry(isolationDeps(w).deps, { audit: createAuditSink(dbs.service) });
});

type Tool = (typeof allTools)[number];
const readTools = allTools.filter((t) => t.access === 'read');
const writeTools = allTools.filter((t) => t.access === 'write');

/** Reads: the shared world and registry. */
const readCache = new Map<string, Promise<CaseResult[]>>();
function readCasesOf(tool: Tool): Promise<CaseResult[]> {
  let p = readCache.get(tool.name);
  if (!p) {
    p = runToolCases(registry, w, tool, ISOLATION_FIXTURES[tool.name]!);
    readCache.set(tool.name, p);
  }
  return p;
}

/** A freshly seeded world with its own deps (empty spies) and registry. */
async function freshWorld() {
  await truncateAll(dbs.owner);
  const world = await seedIsolationWorld(dbs.owner);
  const iso = isolationDeps(world);
  await primeFakeStripe(iso.gateway, dbs.owner);
  return { world, iso, reg: createToolRegistry(iso.deps, { audit: createAuditSink(dbs.service) }) };
}

/** Writes: reseed, then the cases with the write probe. */
const writeCache = new Map<string, Promise<CaseResult[]>>();
function writeCasesOf(tool: Tool): Promise<CaseResult[]> {
  let p = writeCache.get(tool.name);
  if (!p) {
    p = freshWorld().then(({ world, iso, reg }) =>
      runToolCases(reg, world, tool, ISOLATION_FIXTURES[tool.name]!, { owner: dbs.owner, enqueued: iso.enqueued, gateway: iso.gateway, webhooks: iso.webhooks }));
    writeCache.set(tool.name, p);
  }
  return p;
}

const isPositive = (r: CaseResult) => r.scenario.startsWith('positive:');
const failures = (rs: CaseResult[]) => rs.filter((r) => r.outcome === 'leak' || r.outcome === 'wrong_error');
/** A positive control must really resolve (or be an explicit, reasoned `skipPositive`), never pass on a non-tenancy rejection. */
const unresolved = (rs: CaseResult[]) => rs.filter((r) => r.detail?.startsWith('rejected (not tenancy)'));

function inputsOf(fx: IsolationFixture, world: IsolationWorld): unknown[] {
  if (fx.kind === 'client' || fx.kind === 'object') {
    const targets: IsolationTarget[] = [
      { tenant: 'A1', agencyId: world.ids.agencyA, clientId: world.ids.clientA1 },
      { tenant: 'A2', agencyId: world.ids.agencyA, clientId: world.ids.clientA2 },
      { tenant: 'B1', agencyId: world.ids.agencyB, clientId: world.ids.clientB1 },
    ];
    return targets.map((t) => fx.input(world, t));
  }
  if (fx.kind === 'agency') return [fx.input(world)];
  if (fx.kind === 'platform' || fx.kind === 'caller') return [fx.input?.(world) ?? {}];
  return [];
}

describe('isolation suite: fixtures', () => {
  it('fixtures cover exactly the registered tools', () => {
    expect(Object.keys(ISOLATION_FIXTURES).sort()).toEqual(allTools.map((t) => t.name).sort());
  });

  it('VIEWER_WRITES snapshot', () => {
    // Decision 3: the `permission: 'read'` + `access: 'write'` tools (a viewer may call them); reviewed list in fixtures.ts.
    const computed = allTools.filter((t) => t.permission === 'read' && t.access === 'write').map((t) => t.name).sort();
    expect([...VIEWER_WRITES].sort()).toEqual(computed);
    expect(computed).toEqual(['create_api_token', 'delete_ask_thread', 'revoke_api_token', 'revoke_oauth_grant', 'set_my_notification_pref', 'update_my_contact']);
  });

  it("every fixture input parses against the tool's schema", () => {
    const bad: string[] = [];
    for (const [name, fx] of Object.entries(ISOLATION_FIXTURES)) {
      const tool = allTools.find((t) => t.name === name);
      if (!tool) {
        bad.push(`${name}: not a registered tool`);
        continue;
      }
      for (const input of inputsOf(fx, w)) {
        const parsed = tool.input.safeParse(input);
        if (!parsed.success) bad.push(`${name}: ${parsed.error.message}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('isolation suite: read tools', () => {
  for (const tool of readTools) {
    it(`${tool.name}: refuses every negative scenario on every channel`, async () => {
      const rs = (await readCasesOf(tool)).filter((r) => !isPositive(r));
      expect(rs.length).toBeGreaterThan(0);
      expect(failures(rs)).toEqual([]);
    });
    it(`${tool.name}: positive control`, async () => {
      const rs = (await readCasesOf(tool)).filter(isPositive);
      expect(rs.length).toBe((tool.channels ?? ['web']).length);
      expect(failures(rs)).toEqual([]);
      expect(unresolved(rs)).toEqual([]);
    });
  }
});

describe('isolation suite: write tools', () => {
  for (const tool of writeTools) {
    it(`${tool.name}: refused writes leave A unchanged and enqueue nothing`, async () => {
      const rs = (await writeCasesOf(tool)).filter((r) => !isPositive(r));
      expect(rs.length).toBeGreaterThan(0);
      expect(failures(rs)).toEqual([]);
    });
    it(`${tool.name}: positive control`, async () => {
      const rs = (await writeCasesOf(tool)).filter(isPositive);
      expect(rs.length).toBe((tool.channels ?? ['web']).length);
      expect(failures(rs)).toEqual([]);
      expect(unresolved(rs)).toEqual([]);
    });
  }
});

describe('isolation suite: catalogue rows another agency created (Task 0 flag)', () => {
  const code = (p: Promise<unknown>): Promise<string> => p.then(() => 'resolved', (e: unknown) => (e instanceof ToolError ? e.code : 'untyped'));

  it("update_vertical refuses another agency's unreviewed business type; its creator may edit it", async () => {
    const { world, reg } = await freshWorld();
    const input = { verticalId: world.platformIds.unreviewedVertical, audienceNoun: 'pool owners' };
    expect(await code(reg.invoke(world.ctx('adminB'), 'update_vertical', input))).toBe('permission_denied');
    expect(await code(reg.invoke(world.ctx('adminA'), 'update_vertical', input))).toBe('resolved');
  });

  it("add_business_area on another agency's unreviewed business type adds only the caller's own unreviewed area (global catalogue, by design)", async () => {
    const { world, reg } = await freshWorld();
    const out = await reg.invoke(world.ctx('adminB'), 'add_business_area', { verticalId: world.platformIds.unreviewedVertical, name: 'Pool heating' });
    expect(out).toEqual({ verticalId: world.platformIds.unreviewedVertical, areaId: 'pool_heating' });
    // agency A's areas are untouched; the new one is attributed to B and stays unreviewed for the platform team
    const rows = (await dbs.owner.execute(
      sql`SELECT id, status, created_by_agency_id AS by FROM business_area WHERE vertical_id = ${world.platformIds.unreviewedVertical} ORDER BY id`,
    )) as unknown as { id: string; status: string; by: string }[];
    expect(rows).toEqual([
      { id: 'pool_heating', status: 'unreviewed', by: world.ids.agencyB },
      { id: 'pool_opening', status: 'unreviewed', by: world.ids.agencyA },
      { id: 'pool_repair', status: 'unreviewed', by: world.ids.agencyA },
    ]);
  });
});

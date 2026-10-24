/**
 * Phase 7c1: the registry-wide tenant-isolation suite (spec §5, plan Decisions 1–3) over every registered tool with a
 * fixture. Reads share one seeded isolation world. A failing negative case is a leak — fix the tool, never the fixture.
 */
import { createAuditSink } from '@cs/db';
import { type IsolationWorld, seedIsolationWorld, truncateAll } from '@cs/db/test-helpers';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CaseResult, isolationDeps, runToolCases } from './isolation/harness';
import { ISOLATION_FIXTURES, type IsolationFixture, type IsolationTarget } from './isolation/fixtures';
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

const readTools = allTools.filter((t) => t.access === 'read');
const cache = new Map<string, Promise<CaseResult[]>>();
function casesOf(tool: (typeof allTools)[number]): Promise<CaseResult[]> {
  let p = cache.get(tool.name);
  if (!p) {
    p = runToolCases(registry, w, tool, ISOLATION_FIXTURES[tool.name]!);
    cache.set(tool.name, p);
  }
  return p;
}
const isPositive = (r: CaseResult) => r.scenario.startsWith('positive:');
const failures = (rs: CaseResult[]) => rs.filter((r) => r.outcome === 'leak' || r.outcome === 'wrong_error');

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
  it('every registered read tool has a fixture', () => {
    expect(readTools.filter((t) => !ISOLATION_FIXTURES[t.name]).map((t) => t.name)).toEqual([]);
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
  for (const tool of readTools.filter((t) => ISOLATION_FIXTURES[t.name])) {
    it(`${tool.name}: refuses every negative scenario on every channel`, async () => {
      const rs = (await casesOf(tool)).filter((r) => !isPositive(r));
      expect(rs.length).toBeGreaterThan(0);
      expect(failures(rs)).toEqual([]);
    });
    it(`${tool.name}: positive control`, async () => {
      const rs = (await casesOf(tool)).filter(isPositive);
      expect(rs.length).toBe((tool.channels ?? ['web']).length);
      expect(failures(rs)).toEqual([]);
    });
  }
});

import { ToolError, ToolRegistry, toolkit } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { type IsolationWorld, seedIsolationWorld, truncateAll } from '@cs/db/test-helpers';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { dbs } from '../tools/workspace-fixtures';
import type { IsolationFixture } from './fixtures';
import { findForeign, isolationDeps, runToolCases } from './harness';

/** The harness's own tests (plan Review focus 1): it must fail a leaky tool and a wrong-reason refusal. */
let w: IsolationWorld;
let registry: ToolRegistry<ToolDeps>;

const { defineTool } = toolkit<ToolDeps>();
const clientFx: IsolationFixture = { kind: 'client', input: (_w, t) => ({ clientId: t.clientId }) };

const leaky = defineTool({
  name: 'planted_leaky_profile', access: 'read', description: 'test', permission: 'read', channels: ['web', 'mcp'],
  input: z.object({ clientId: z.string().uuid() }), output: z.object({ name: z.string() }),
  // Ignores the caller and the client: always answers with a B1 canary.
  async handler() { return { name: `Profile ${w.canaries('B1')[0]!}` }; },
});
const wrongReason = defineTool({
  name: 'planted_wrong_reason', access: 'read', description: 'test', permission: 'read',
  input: z.object({ clientId: z.string().uuid() }), output: z.object({ ok: z.boolean() }),
  async handler(ctx, { clientId }) {
    if (ctx.clientScope !== 'all' && !ctx.clientScope.includes(clientId)) throw new ToolError('invalid_input', 'Bad client');
    if (ctx.clientScope === 'all' && ctx.agencyId !== w.ids.agencyA) throw new ToolError('invalid_input', 'Bad client');
    return { ok: true };
  },
});
const tight = defineTool({
  name: 'planted_tight', access: 'read', description: 'test', permission: 'read',
  input: z.object({ clientId: z.string().uuid() }), output: z.object({ ok: z.boolean() }),
  async handler(ctx, { clientId }) {
    const agencyOf: Record<string, string> = { [w.ids.clientA1]: w.ids.agencyA, [w.ids.clientA2]: w.ids.agencyA, [w.ids.clientB1]: w.ids.agencyB };
    const own = agencyOf[clientId] === ctx.agencyId && (ctx.clientScope === 'all' || ctx.clientScope.includes(clientId));
    if (!own) throw new ToolError('not_found', `Client ${clientId} not found`);
    return { ok: true };
  },
});

beforeAll(async () => {
  await truncateAll(dbs.owner);
  w = await seedIsolationWorld(dbs.owner);
  registry = new ToolRegistry<ToolDeps>(isolationDeps(w).deps, { record: async () => {} }, Date.now, { hashInput }).register(leaky, wrongReason, tight);
});

describe('isolation harness', () => {
  it('a planted leaky tool fails', async () => {
    const results = await runToolCases(registry, w, leaky, clientFx);
    const adminB = results.filter((r) => r.scenario === 'adminB→A1');
    expect(adminB.map((r) => r.channel).sort()).toEqual(['mcp', 'web']);
    expect(adminB.every((r) => r.outcome === 'leak')).toBe(true);
    // the positive control resolves too, but carries a B1 canary into agency A
    expect(results.find((r) => r.scenario === 'positive:adminA→A1' && r.channel === 'web')).toMatchObject({ outcome: 'leak' });
  });

  it('an invalid_input refusal is wrong_error', async () => {
    const results = await runToolCases(registry, w, wrongReason, clientFx);
    expect(results.find((r) => r.scenario === 'adminB→A1')).toMatchObject({ outcome: 'wrong_error' });
    expect(results.find((r) => r.scenario === 'ownerA2→A1')).toMatchObject({ outcome: 'wrong_error' });
    expect(results.find((r) => r.scenario === 'positive:adminA→A1')).toMatchObject({ outcome: 'ok' });
  });

  it('a tenancy-correct tool passes every case', async () => {
    const results = await runToolCases(registry, w, tight, clientFx);
    expect(results.filter((r) => !r.scenario.startsWith('positive:')).map((r) => r.outcome)).toEqual(['refused', 'refused', 'refused']);
    expect(results.find((r) => r.scenario === 'positive:adminA→A1')).toMatchObject({ outcome: 'ok' });
  });

  it('a positive control refused for tenancy fails', async () => {
    const results = await runToolCases(registry, w, tight, { kind: 'client', input: (_w, t) => ({ clientId: t.tenant === 'A1' ? w.ids.clientB1 : t.clientId }) });
    expect(results.find((r) => r.scenario === 'positive:adminA→A1')).toMatchObject({ outcome: 'wrong_error' });
  });

  it('skipPositive still demands an input that parses', async () => {
    const results = await runToolCases(registry, w, tight, { kind: 'client', input: () => ({ clientId: 'nope' }), skipPositive: 'external service' });
    expect(results.find((r) => r.scenario === 'positive:adminA→A1')).toMatchObject({ outcome: 'wrong_error' });
  });

  it('findForeign spots a canary nested in an array', () => {
    const b1 = w.canaries('B1')[2]!;
    expect(findForeign({ items: [{ ok: 'fine' }, { nested: [`text ${b1} here`] }] }, w, ['B1'])).toContain(b1);
    expect(findForeign({ items: [{ nested: [`text ${b1} here`] }] }, w, ['A2'])).toBeNull();
  });

  it('findForeign spots a foreign id in a value or a key, and honours exceptions', () => {
    const id = w.idsOf('B1')[0]!;
    expect(findForeign([{ ref: id.toUpperCase() }], w, ['B1'])).toContain(id);
    expect(findForeign({ byId: { [id]: 1 } }, w, ['B1'])).toContain(id);
    expect(findForeign(`Client ${id} not found`, w, ['B1'], new Set([id]))).toBeNull();
    expect(findForeign({ n: 3, d: null, t: true }, w, ['B1'])).toBeNull();
  });
});

import { type AccessContext, ToolError, ToolRegistry, toolkit } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { type IsolationWorld, seedIsolationWorld, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { dbs } from '../tools/workspace-fixtures';
import type { IsolationFixture } from './fixtures';
import { findForeign, fingerprintA, isolationDeps, runToolCases, type WriteProbe } from './harness';

/** The harness's own tests (plan Review focus 1): it must fail a leaky tool and a wrong-reason refusal. */
let w: IsolationWorld;
let registry: ToolRegistry<ToolDeps>;
let probe: WriteProbe;

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

const ownsClient = (ctx: AccessContext, clientId: string): boolean => {
  const agencyOf: Record<string, string> = { [w.ids.clientA1]: w.ids.agencyA, [w.ids.clientA2]: w.ids.agencyA, [w.ids.clientB1]: w.ids.agencyB };
  return agencyOf[clientId] === ctx.agencyId && (ctx.clientScope === 'all' || ctx.clientScope.includes(clientId));
};
// Writes the client's brief summary first, checks tenancy second: a refusal that still mutated A.
const writeThenRefuse = defineTool({
  name: 'planted_write_then_refuse', access: 'write', description: 'test', permission: 'manage',
  input: z.object({ clientId: z.string().uuid() }), output: z.object({ ok: z.boolean() }),
  async handler(ctx, { clientId }, deps) {
    await deps.service.execute(sql`UPDATE brief SET summary = 'planted' WHERE client_id = ${clientId}`);
    if (!ownsClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    return { ok: true };
  },
});
// Enqueues and calls the billing gateway before refusing.
const sideEffectThenRefuse = defineTool({
  name: 'planted_side_effect_then_refuse', access: 'write', description: 'test', permission: 'manage',
  input: z.object({ clientId: z.string().uuid() }), output: z.object({ ok: z.boolean() }),
  async handler(ctx, { clientId }, deps) {
    await deps.enqueue?.('rank-scan', { clientId }, `planted:${clientId}`);
    await deps.billing?.createCustomer({ agencyId: ctx.agencyId, name: 'planted' });
    if (!ownsClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    return { ok: true };
  },
});
// Checks first, then writes: tenancy-correct (the viewer is refused by the registry for `manage`).
const tightWrite = defineTool({
  name: 'planted_tight_write', access: 'write', description: 'test', permission: 'manage',
  input: z.object({ clientId: z.string().uuid() }), output: z.object({ ok: z.boolean() }),
  async handler(ctx, { clientId }, deps) {
    if (!ownsClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    await deps.service.execute(sql`UPDATE brief SET summary = 'positive' WHERE client_id = ${clientId}`);
    await deps.enqueue?.('rank-scan', { clientId }, `planted:${clientId}`);
    return { ok: true };
  },
});

beforeAll(async () => {
  await truncateAll(dbs.owner);
  w = await seedIsolationWorld(dbs.owner);
  const iso = isolationDeps(w);
  probe = { owner: dbs.owner, enqueued: iso.enqueued, gateway: iso.gateway };
  registry = new ToolRegistry<ToolDeps>(iso.deps, { record: async () => {} }, Date.now, { hashInput })
    .register(leaky, wrongReason, tight, writeThenRefuse, sideEffectThenRefuse, tightWrite);
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

  it('a refused write that still mutated A is a leak', async () => {
    const results = await runToolCases(registry, w, writeThenRefuse, clientFx, probe);
    expect(results.find((r) => r.scenario === 'adminB→A1')).toMatchObject({ outcome: 'leak' });
    expect(results.find((r) => r.scenario === 'adminB→A1')?.detail).toContain('brief/A1');
    expect(results.find((r) => r.scenario === 'amA→A2')?.detail).toContain('brief/A2');
  });

  it('a refused write that enqueues or calls the billing gateway is a leak', async () => {
    probe.enqueued.length = 0;
    const results = await runToolCases(registry, w, sideEffectThenRefuse, clientFx, probe);
    const adminB = results.find((r) => r.scenario === 'adminB→A1');
    expect(adminB).toMatchObject({ outcome: 'leak' });
    expect(adminB?.detail).toMatch(/enqueue/);
    expect(adminB?.detail).toMatch(/createCustomer/);
  });

  it('a tenancy-correct write passes, the viewer included, and its positive control may mutate', async () => {
    await truncateAll(dbs.owner);
    w = await seedIsolationWorld(dbs.owner);
    probe.enqueued.length = 0;
    probe.gateway.calls.length = 0;
    const results = await runToolCases(registry, w, tightWrite, clientFx, probe);
    expect(results.map((r) => `${r.scenario}:${r.outcome}`)).toEqual([
      'adminB→A1:refused', 'ownerA2→A1:refused', 'amA→A2:refused', 'viewerA1→A1:refused', 'positive:adminA→A1:ok',
    ]);
    expect(probe.enqueued).toHaveLength(1);
  });

  it('fingerprintA covers A rows (incl. parent-linked tables) only, never audit_log', async () => {
    await truncateAll(dbs.owner);
    w = await seedIsolationWorld(dbs.owner);
    const before = await fingerprintA(dbs.owner, w);
    expect(Object.keys(before)).toEqual(expect.arrayContaining(['brief/A1', 'brief/A2', 'agency/A', 'contact/A', 'membership/A1', 'runbook_item/A1', 'event_change/A1', 'notification/A2']));
    expect(Object.keys(before).some((k) => k.startsWith('audit_log/') || k.startsWith('mcp_rate_window/') || k.startsWith('competitor/'))).toBe(false);
    await dbs.owner.execute(sql`UPDATE brief SET summary = 'b-side' WHERE client_id = ${w.ids.clientB1}`);
    await dbs.owner.execute(sql`INSERT INTO audit_log (agency_id, user_id, role, tool, input_hash, outcome, duration_ms, channel) VALUES (${w.ids.agencyA}, 'u', 'agency_admin', 'x', 'x', 'ok', 1, 'web')`);
    expect(await fingerprintA(dbs.owner, w)).toEqual(before);
    await dbs.owner.execute(sql`UPDATE runbook_item SET enabled = NOT enabled WHERE runbook_id IN (SELECT id FROM runbook WHERE client_id = ${w.ids.clientA1})`);
    // a deleted row counts too (the key disappears)
    await dbs.owner.execute(sql`DELETE FROM ask_starter WHERE client_id = ${w.ids.clientA2}`);
    const after = await fingerprintA(dbs.owner, w);
    const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]).sort();
    expect(changed).toEqual(['ask_starter/A2', 'runbook_item/A1']);
  });
});

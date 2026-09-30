import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAccessContext } from './access';
import { type AuditEvent, ToolError, ToolRegistry, toolkit } from './tools';

const A = '00000000-0000-4000-8000-00000000000a';
const C1 = '00000000-0000-4000-8000-0000000000c1';

interface Deps { greeting: string }
const { defineTool } = toolkit<Deps>();

const echo = defineTool({
  name: 'echo',
  description: 'Echo a message',
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ items: z.array(z.string()) }),
  permission: 'read',
  handler: async (_ctx, input, deps) => ({ items: [`${deps.greeting} ${input.message}`] }),
});

const manage = defineTool({
  name: 'add_thing',
  description: 'Needs manage + feature',
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  permission: 'manage',
  feature: 'manage_competitors',
  handler: async () => ({ ok: true }),
});

const broken = defineTool({
  name: 'broken',
  description: 'Throws',
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  permission: 'read',
  handler: async () => { throw new Error('boom'); },
});

const denied = defineTool({
  name: 'rate_limited_tool',
  description: 'Throws a ToolError',
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  permission: 'read',
  handler: async () => { throw new ToolError('rate_limited', 'slow down'); },
});

const badOutput = defineTool({
  name: 'bad_output',
  description: 'Returns wrong shape',
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  permission: 'read',
  handler: async () => ({ ok: 'yes' }) as unknown as { ok: boolean },
});

const admin = createAccessContext({ agencyId: A, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const viewer = createAccessContext({ agencyId: A, userId: 'v', role: 'client_viewer', clientScope: [C1], features: [] });
const ownerNoFeature = createAccessContext({ agencyId: A, userId: 'o', role: 'client_owner', clientScope: [C1], features: [] });
const ownerWithFeature = createAccessContext({ agencyId: A, userId: 'o', role: 'client_owner', clientScope: [C1], features: ['manage_competitors'] });

let events: AuditEvent[];
let registry: ToolRegistry<Deps>;

beforeEach(() => {
  events = [];
  let t = 1000;
  registry = new ToolRegistry<Deps>({ greeting: 'hi' }, { record: async (e) => { events.push(e); } }, () => (t += 5));
  registry.register(echo, manage, broken, denied, badOutput);
});

describe('ToolRegistry', () => {
  it('rejects duplicate and invalid names', () => {
    expect(() => registry.register(echo)).toThrow(/duplicate/i);
    expect(() => registry.register({ ...echo, name: 'Bad-Name' })).toThrow(/invalid tool name/i);
  });

  it('filters tools by permission and feature', () => {
    const names = (ctx: typeof admin) => registry.list(ctx).map((t) => t.name).sort();
    expect(names(viewer)).not.toContain('add_thing');
    expect(names(ownerNoFeature)).not.toContain('add_thing');
    expect(names(ownerWithFeature)).toContain('add_thing');
    expect(names(admin)).toContain('add_thing'); // agency roles bypass feature flags
  });

  it('describes tools with JSON schema', () => {
    const d = registry.describe(viewer).find((t) => t.name === 'echo');
    expect(d?.inputSchema).toMatchObject({ type: 'object', properties: { message: { type: 'string' } } });
  });

  it('invokes a tool and audits success with row count', async () => {
    const out = await registry.invoke(viewer, 'echo', { message: 'there' });
    expect(out).toEqual({ items: ['hi there'] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tool: 'echo', outcome: 'ok', rowCount: 1, durationMs: 5, userId: 'v', agencyId: A });
    expect(events[0]?.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns invalid_input for bad input', async () => {
    await expect(registry.invoke(viewer, 'echo', { message: '' })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(events[0]?.outcome).toBe('invalid_input');
  });

  it('returns not_found and permission_denied', async () => {
    await expect(registry.invoke(viewer, 'nope', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(viewer, 'add_thing', {})).rejects.toMatchObject({ code: 'permission_denied' });
    expect(events.map((e) => e.outcome)).toEqual(['not_found', 'permission_denied']);
  });

  it('propagates ToolError codes and wraps unexpected errors as internal', async () => {
    await expect(registry.invoke(viewer, 'rate_limited_tool', {})).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(registry.invoke(viewer, 'broken', {})).rejects.toMatchObject({ code: 'internal' });
    await expect(registry.invoke(viewer, 'bad_output', {})).rejects.toMatchObject({ code: 'internal' });
  });
});

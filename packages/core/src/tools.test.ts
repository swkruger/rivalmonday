import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAccessContext } from './access';
import { type AuditEvent, ToolError, ToolRegistry, countRows, mcpScopeOf, toolkit } from './tools';

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

  it('returns invalid_input and audits once for unserialisable input', async () => {
    const circular: Record<string, unknown> = { message: 'x' };
    circular.self = circular;

    await expect(registry.invoke(viewer, 'echo', circular)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'invalid_input', inputHash: 'unhashable' });
  });

  it('returns not_found for unknown tools and not_found (audited permission_denied) for hidden ones', async () => {
    await expect(registry.invoke(viewer, 'nope', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(viewer, 'add_thing', {})).rejects.toMatchObject({ code: 'not_found' });
    expect(events.map((e) => e.outcome)).toEqual(['not_found', 'permission_denied']);
  });

  it('propagates ToolError codes and wraps unexpected errors as internal', async () => {
    await expect(registry.invoke(viewer, 'rate_limited_tool', {})).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(registry.invoke(viewer, 'broken', {})).rejects.toMatchObject({ code: 'internal' });
    await expect(registry.invoke(viewer, 'bad_output', {})).rejects.toMatchObject({ code: 'internal' });
  });

  describe('when the audit sink itself fails', () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    it('fails closed with a typed internal error even though the tool itself succeeded', async () => {
      const failingRegistry = new ToolRegistry<Deps>(
        { greeting: 'hi' },
        { record: async () => { throw new Error('audit sink down'); } },
      );
      failingRegistry.register(echo);

      await expect(failingRegistry.invoke(viewer, 'echo', { message: 'there' })).rejects.toMatchObject({
        code: 'internal',
        message: 'Audit logging failed',
      });
      expect(consoleError).toHaveBeenCalledWith('[tools] audit write failed', expect.any(Error));
    });
  });
});

const mcpRead = defineTool({
  name: 'mcp_read', description: 'mcp read', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'read', channels: ['mcp'], handler: async () => ({ ok: true }),
});
const mcpFeedback = defineTool({
  name: 'mcp_feedback', description: 'mcp feedback', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'read', channels: ['mcp'], mcpScope: 'feedback', handler: async () => ({ ok: true }),
});
const mcpManage = defineTool({
  name: 'mcp_manage', description: 'mcp manage', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'read', channels: ['mcp'], mcpScope: 'manage', handler: async () => ({ ok: true }),
});
const agencyOnlyManage = defineTool({
  name: 'agency_manage', description: 'agency manage', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'agency', channels: ['web', 'mcp'], mcpScope: 'manage', handler: async () => ({ ok: true }),
});
const quiet = defineTool({
  name: 'quiet', description: 'skip-web audit', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'read', channels: ['web', 'mcp'], audit: 'skip-web', handler: async () => ({ ok: true }),
});
const metaProbe = defineTool({
  name: 'meta_probe', description: 'returns meta', input: z.object({}),
  output: z.object({ channel: z.string(), tokenId: z.string().nullable() }),
  permission: 'read', channels: ['web', 'mcp'], handler: async (_c, _i, _d, meta) => meta,
});

describe('channels and token scopes', () => {
  const mcpOwner = createAccessContext({ agencyId: A, userId: 'o', role: 'client_owner', clientScope: [C1], features: ['mcp'] });
  const names = (ctx: typeof admin, opts?: Parameters<typeof registry.list>[1]) => registry.list(ctx, opts).map((t) => t.name).sort();

  beforeEach(() => {
    registry.register(mcpRead, mcpFeedback, mcpManage, agencyOnlyManage, quiet, metaProbe);
  });

  it('defaults to channel web and hides mcp-only tools from web', () => {
    expect(names(admin)).not.toContain('mcp_read');
    expect(names(admin)).toContain('echo');
    expect(names(admin, { channel: 'web' })).not.toContain('mcp_read');
  });

  it('mcp channel requires tokenScope', () => {
    expect(names(admin, { channel: 'mcp' })).toEqual([]);
    expect(names(admin, { channel: 'mcp', tokenScope: 'read' })).toContain('mcp_read');
  });

  it('token scope read hides feedback and manage tools', () => {
    const read = names(admin, { channel: 'mcp', tokenScope: 'read' });
    expect(read).toContain('mcp_read');
    expect(read).not.toContain('mcp_feedback');
    expect(read).not.toContain('mcp_manage');
    const fb = names(admin, { channel: 'mcp', tokenScope: 'feedback' });
    expect(fb).toContain('mcp_feedback');
    expect(fb).not.toContain('mcp_manage');
  });

  it('mcpScope overrides permission (agency tool with mcpScope manage)', () => {
    expect(names(admin, { channel: 'mcp', tokenScope: 'feedback' })).not.toContain('agency_manage');
    expect(names(admin, { channel: 'mcp', tokenScope: 'manage' })).toContain('agency_manage');
    expect(mcpScopeOf({ permission: 'agency' })).toBe('read');
    expect(mcpScopeOf({ permission: 'agency', mcpScope: 'manage' })).toBe('manage');
  });

  it('client role without mcp feature sees no mcp tools; agency role does', () => {
    const opts = { channel: 'mcp', tokenScope: 'read' } as const;
    expect(names(ownerNoFeature, opts)).toEqual([]);
    expect(names(mcpOwner, opts)).toContain('mcp_read');
    expect(names(admin, opts)).toContain('mcp_read');
  });

  it('unknown and hidden tools throw identical not_found', async () => {
    const a = await registry.invoke(admin, 'nope', {}).catch((e: ToolError) => e);
    const b = await registry.invoke(admin, 'mcp_read', {}).catch((e: ToolError) => e);
    expect(a).toBeInstanceOf(ToolError);
    expect((b as ToolError).code).toBe((a as ToolError).code);
    expect((b as ToolError).code).toBe('not_found');
    expect((b as ToolError).message.replace('mcp_read', 'X')).toBe((a as ToolError).message.replace('nope', 'X'));
  });

  it('hidden call audits permission_denied', async () => {
    await registry.invoke(admin, 'mcp_read', {}).catch(() => {});
    expect(events.at(-1)).toMatchObject({ tool: 'mcp_read', outcome: 'permission_denied' });
  });

  it('skip-web skips audit on web only', async () => {
    await registry.invoke(viewer, 'quiet', {});
    expect(events).toHaveLength(0);
    await registry.invoke(admin, 'quiet', {}, { channel: 'mcp', tokenScope: 'read', tokenId: 't1' });
    expect(events).toHaveLength(1);
  });

  it('audit row carries channel and tokenId', async () => {
    await registry.invoke(viewer, 'echo', { message: 'x' });
    expect(events.at(-1)).toMatchObject({ channel: 'web', tokenId: null });
    await registry.invoke(admin, 'mcp_read', {}, { channel: 'mcp', tokenScope: 'read', tokenId: 'tok-1' });
    expect(events.at(-1)).toMatchObject({ channel: 'mcp', tokenId: 'tok-1' });
  });

  it('handler receives meta', async () => {
    expect(await registry.invoke(admin, 'meta_probe', {})).toEqual({ channel: 'web', tokenId: null });
    expect(await registry.invoke(admin, 'meta_probe', {}, { channel: 'mcp', tokenScope: 'read', tokenId: 'tok-9' }))
      .toEqual({ channel: 'mcp', tokenId: 'tok-9' });
  });
});

describe('countRows', () => {
  it('handles items, arrays, results, other', () => {
    expect(countRows({ items: [1, 2] })).toBe(2);
    expect(countRows([1, 2, 3])).toBe(3);
    expect(countRows({ results: [1] })).toBe(1);
    expect(countRows({ ok: true })).toBeNull();
    expect(countRows(null)).toBeNull();
  });
});

describe('error logging', () => {
  it('logs the handler error before the audit error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = new ToolRegistry<Deps>({ greeting: 'hi' }, { record: async () => { throw new Error('sink down'); } });
    r.register(broken);
    await expect(r.invoke(viewer, 'broken', {})).rejects.toMatchObject({ code: 'internal', message: 'Audit logging failed' });
    expect(spy.mock.calls[0]?.[0]).toBe('[tools] tool error before audit failure');
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ code: 'internal' });
    expect(spy.mock.calls[1]?.[0]).toBe('[tools] audit write failed');
    spy.mockRestore();
  });
});

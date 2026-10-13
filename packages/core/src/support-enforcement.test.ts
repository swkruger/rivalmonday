import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAccessContext } from './access';
import { type AuditEvent, ToolError, ToolRegistry, toolkit } from './tools';

const A = '00000000-0000-4000-8000-00000000000a';
const SID = '00000000-0000-4000-8000-0000000005e5';
const OP = 'platform-user-1';

const { defineTool } = toolkit<Record<string, never>>();

const writeHandler = vi.fn(async () => ({ ok: true }));
const writeTool = defineTool({
  name: 'do_write', access: 'write', description: 'w', input: z.object({ n: z.number() }),
  output: z.object({ ok: z.boolean() }), permission: 'agency', channels: ['web', 'mcp'], handler: writeHandler,
});
const readTool = defineTool({
  name: 'read_people', access: 'read', description: 'r', input: z.object({}),
  output: z.object({ owner: z.object({ email: z.string() }), items: z.array(z.object({ email: z.string(), name: z.string() })) }),
  permission: 'read', channels: ['web', 'mcp'], supportMask: ['owner.email', 'items[].email'],
  handler: async () => ({ owner: { email: 'john@acme.com' }, items: [{ email: 'ann@b.io', name: 'Ann' }] }),
});
const hiddenTool = defineTool({
  name: 'list_my_private', access: 'read', description: 'h', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'read', supportHidden: true, handler: async () => ({ ok: true }),
});

const quietTool = defineTool({
  name: 'quiet_read', access: 'read', description: 'q', input: z.object({}), output: z.object({ ok: z.boolean() }),
  permission: 'read', audit: 'skip-web', handler: async () => ({ ok: true }),
});

const support = createAccessContext({
  agencyId: A, userId: OP, role: 'agency_admin', clientScope: 'all', features: [],
  support: { sessionId: SID, platformUserId: OP },
});
const admin = createAccessContext({ agencyId: A, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });

let events: AuditEvent[];
let registry: ToolRegistry<Record<string, never>>;

beforeEach(() => {
  events = [];
  writeHandler.mockClear();
  registry = new ToolRegistry<Record<string, never>>({}, { record: async (e) => { events.push(e); } });
  registry.register(writeTool, readTool, hiddenTool, quietTool);
});

describe('support-session enforcement', () => {
  it('refuses a write tool with read_only_session before parsing and never calls the handler', async () => {
    const err = await registry.invoke(support, 'do_write', { n: 'not-a-number' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err).toMatchObject({ code: 'read_only_session', message: 'Read-only support session — changes are disabled.' });
    expect(writeHandler).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ tool: 'do_write', outcome: 'read_only_session' });
  });

  it('keeps write tools listed (refusal is on invoke) but runs them normally without a support ctx', async () => {
    expect(registry.list(support).map((t) => t.name)).toContain('do_write');
    await expect(registry.invoke(admin, 'do_write', { n: 1 })).resolves.toEqual({ ok: true });
    expect(writeHandler).toHaveBeenCalledTimes(1);
  });

  it('runs a read tool and masks its output per supportMask', async () => {
    const out = await registry.invoke(support, 'read_people', {});
    expect(out).toEqual({ owner: { email: 'j•••@acme.com' }, items: [{ email: 'a•••@b.io', name: 'Ann' }] });
  });

  it('masks nothing without a support ctx', async () => {
    const out = await registry.invoke(admin, 'read_people', {});
    expect(out).toEqual({ owner: { email: 'john@acme.com' }, items: [{ email: 'ann@b.io', name: 'Ann' }] });
  });

  it('hides supportHidden tools: not_found on invoke, absent from list/describe', async () => {
    await expect(registry.invoke(support, 'list_my_private', {})).rejects.toMatchObject({ code: 'not_found' });
    expect(events.at(-1)).toMatchObject({ tool: 'list_my_private', outcome: 'permission_denied' });
    expect(registry.list(support).map((t) => t.name)).not.toContain('list_my_private');
    expect(registry.describe(support).map((t) => t.name)).not.toContain('list_my_private');
    // visible to the same role outside a session
    expect(registry.list(admin).map((t) => t.name)).toContain('list_my_private');
    await expect(registry.invoke(admin, 'list_my_private', {})).resolves.toEqual({ ok: true });
  });

  it('refuses every non-web channel with permission_denied and lists nothing there', async () => {
    const mcp = { channel: 'mcp', tokenScope: 'manage', tokenId: 't' } as const;
    await expect(registry.invoke(support, 'read_people', {}, mcp)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(support, 'do_write', { n: 1 }, mcp)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(support, 'read_people', {}, { channel: 'ask' })).rejects.toMatchObject({ code: 'permission_denied' });
    expect(writeHandler).not.toHaveBeenCalled();
    expect(registry.list(support, mcp)).toEqual([]);
    expect(registry.describe(support, mcp)).toEqual([]);
    expect(registry.list(admin, mcp).map((t) => t.name)).toContain('read_people');
  });

  it('audits as platform_support with the session id and platform user id', async () => {
    await registry.invoke(support, 'read_people', {});
    expect(events.at(-1)).toMatchObject({
      agencyId: A, role: 'platform_support', supportSessionId: SID, userId: OP, outcome: 'ok', channel: 'web',
    });
    await registry.invoke(support, 'do_write', { n: 1 }).catch(() => {});
    expect(events.at(-1)).toMatchObject({ role: 'platform_support', supportSessionId: SID, userId: OP, outcome: 'read_only_session' });
  });

  it('audits non-support calls with the ctx role and a null session id', async () => {
    await registry.invoke(admin, 'read_people', {});
    expect(events.at(-1)).toMatchObject({ role: 'agency_admin', userId: 'admin', supportSessionId: null });
  });

  it('audits skip-web tools inside a support session, but still skips them outside one', async () => {
    await registry.invoke(admin, 'quiet_read', {});
    expect(events).toHaveLength(0);
    await registry.invoke(support, 'quiet_read', {});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tool: 'quiet_read', role: 'platform_support', supportSessionId: SID, userId: OP, outcome: 'ok' });
  });
});

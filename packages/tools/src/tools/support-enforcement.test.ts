import { type AuditEvent, ToolError, createAccessContext, FEATURES } from '@cs/core';
import { describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { allTools } from './all';

const A = '00000000-0000-4000-8000-00000000000a';
const SID = '00000000-0000-4000-8000-0000000005e5';
const OP = 'platform-user-1'; // distinct from the ctx userId so the audit row provably uses platformUserId

/** Any property read on the deps (db handles, enqueue, stores…) fails the test: refusal must happen before the handler. */
const untouchableDeps = new Proxy({} as ToolDeps, {
  get(_t, prop) {
    if (prop === 'then') return undefined; // not a thenable
    throw new Error(`deps.${String(prop)} touched under a support session`);
  },
});

const support = createAccessContext({
  agencyId: A, userId: 'ctx-user-id', role: 'agency_admin', clientScope: 'all', features: [...FEATURES],
  support: { sessionId: SID, platformUserId: OP },
});

describe('support sessions refuse every registered write tool', () => {
  const writes = allTools.filter((t) => t.access === 'write');

  it('has write tools to check', () => {
    expect(writes.length).toBeGreaterThan(40);
  });

  it.each(writes.map((t) => [t.name, t] as const))('%s → read_only_session without touching deps', async (_name, tool) => {
    const events: AuditEvent[] = [];
    const registry = createToolRegistry(untouchableDeps, { audit: { record: async (e) => { events.push(e); } } });
    const err = await registry.invoke(support, tool.name, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    const webVisible = (tool.channels ?? ['web']).includes('web') && !tool.supportHidden;
    // Web-visible writes get the g10 refusal; hidden or non-web ones are already unknown (not_found).
    expect((err as ToolError).code).toBe(webVisible ? 'read_only_session' : 'not_found');
    if (webVisible) expect((err as ToolError).message).toBe('Read-only support session — changes are disabled.');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ role: 'platform_support', supportSessionId: SID, userId: OP });
  });

  it.each(writes.filter((t) => (t.channels ?? []).some((c) => c !== 'web')).map((t) => [t.name, t] as const))(
    '%s on a non-web channel → permission_denied without touching deps',
    async (_name, tool) => {
      const registry = createToolRegistry(untouchableDeps, { audit: { record: async () => {} } });
      const channel = (tool.channels ?? []).find((c) => c !== 'web')!;
      const err = await registry.invoke(support, tool.name, {}, { channel, tokenScope: 'manage', tokenId: 't' }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'permission_denied' });
    },
  );
});

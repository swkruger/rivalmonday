import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  viewer: null as unknown,
  to: null as string | null,
  record: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock('@cs/tools', () => ({ recordSupportAccess: (...a: unknown[]) => m.record(...a) }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/billing-state', () => ({ agencySuspended: async () => false }));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: 'app-db', service: 'service-db' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'http://app.test' }) }));
vi.mock('@/server/links', async (orig) => ({ ...(await orig<typeof import('@/server/links')>()), goDestination: async () => m.to }));

import { GET } from './route';

const ID = '00000000-0000-4000-8000-0000000000aa';
const call = () => GET(new Request(`http://app.test/go/brief/${ID}`), { params: Promise.resolve({ target: 'brief', id: ID }) });
const supportCtx = { agencyId: 'a', support: { sessionId: 's', platformUserId: 'op' } };

afterEach(() => { m.record.mockClear(); });

describe('GET /go/[target]/[id] support audit (7a2)', () => {
  it('records support_view_go after the destination resolves', async () => {
    m.viewer = { kind: 'support', ctx: supportCtx };
    m.to = '/c/x/briefs/y';
    const r = await call();
    expect(r.status).toBe(307);
    expect(m.record).toHaveBeenCalledWith('service-db', supportCtx, { surface: 'go', subjectId: `brief:${ID}` });
  });

  it('records nothing for an unresolved link', async () => {
    m.viewer = { kind: 'support', ctx: supportCtx };
    m.to = null;
    expect((await call()).status).toBe(404);
    expect(m.record).not.toHaveBeenCalled();
  });
});

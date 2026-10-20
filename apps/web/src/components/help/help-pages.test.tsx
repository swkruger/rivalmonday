import type { Role } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ role: 'agency_admin' as string, loads: [] as Record<string, unknown>[] }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/current-viewer', () => {
  const get = async () => {
    const { createAccessContext } = await import('@cs/core');
    const ctx = createAccessContext({ agencyId: '00000000-0000-4000-8000-00000000000a', userId: 'u', role: m.role as Role, clientScope: m.role.startsWith('client') ? ['00000000-0000-4000-8000-0000000000c1'] : 'all', features: [] });
    return { viewer: { kind: 'user', ctx }, ctx };
  };
  return { requireContext: get, requireOperatorContext: get };
});
vi.mock('@/server/help-index', () => ({
  loadHelpIndex: async (o: Record<string, unknown>) => {
    m.loads.push(o);
    return { articleBase: '/kb', groups: [], glossary: [], query: '', results: null, ask: null, contactEmail: null };
  },
}));
vi.mock('@/server/help', () => ({ helpClientName: async () => 'Brazos Plumbing' }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => 'owner' }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/help/help-index', () => ({ HelpIndex: () => null }));

const { default: AgencyHelp, metadata: agencyMeta } = await import('@/app/(app)/agency/help/page');
const { default: ClientHelp, metadata: clientMeta } = await import('@/app/(app)/c/[clientId]/help/page');
const { default: PlatformHelp, metadata: platformMeta } = await import('@/app/(platform)/platform/help/page');

beforeEach(() => { m.loads = []; });
const sp = (q?: string) => Promise.resolve(q ? { q } : {});

describe('Help pages', () => {
  it('are titled "Help"', () => {
    expect([agencyMeta.title, clientMeta.title, platformMeta.title]).toEqual(['Help', 'Help', 'Help']);
  });

  it('agency page: agency roles only', async () => {
    for (const role of ['agency_admin', 'account_manager']) {
      m.role = role;
      await AgencyHelp({ searchParams: sp('x') });
    }
    expect(m.loads.map((l) => [l.context, l.q])).toEqual([['agency', 'x'], ['agency', 'x']]);
    for (const role of ['client_owner', 'client_viewer']) {
      m.role = role;
      await expect(AgencyHelp({ searchParams: sp() })).rejects.toThrow('NEXT_NOT_FOUND');
    }
    expect(m.loads).toHaveLength(2);
  });

  it('client page: any role reaches the loader with the client id (which refuses foreign clients)', async () => {
    for (const role of ['agency_admin', 'client_owner', 'client_viewer']) {
      m.role = role;
      await ClientHelp({ params: Promise.resolve({ clientId: 'c1' }), searchParams: sp() });
    }
    expect(m.loads.map((l) => [l.context, l.clientId])).toEqual([['client', 'c1'], ['client', 'c1'], ['client', 'c1']]);
  });

  it('platform page: loads the platform context with the owner flag; the refusal for non-operators comes from the loader', async () => {
    m.role = 'agency_admin';
    await PlatformHelp({ searchParams: sp('q1') });
    expect(m.loads[0]).toMatchObject({ context: 'platform', q: 'q1', platformOwner: true });
  });
});

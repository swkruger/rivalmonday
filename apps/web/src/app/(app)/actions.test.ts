import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: null as null | { user: { id: string } }, endOpen: vi.fn(), set: vi.fn() }));
vi.mock('@/server/auth', () => ({ auth: () => ({ api: { getSession: async () => m.session } }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'service-db' }) }));
vi.mock('@cs/tools', () => ({ endOpenSessionFor: (...a: unknown[]) => m.endOpen(...a) }));
vi.mock('@/server/current-viewer', () => ({ requireContext: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ set: m.set }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
const { endSession } = await import('./actions');

beforeEach(() => { m.endOpen.mockReset(); m.set.mockReset(); });

describe('endSession (sign-out)', () => {
  it('ends the signed-in user own support session and clears rm_support with the other session cookies', async () => {
    m.session = { user: { id: 'op' } };
    await endSession();
    expect(m.endOpen).toHaveBeenCalledWith('service-db', 'op');
    const cleared = m.set.mock.calls.map((c) => c[0]);
    expect(cleared).toEqual(expect.arrayContaining(['rm_support', 'rm_guest', 'rm_membership']));
    expect(m.set.mock.calls.find((c) => c[0] === 'rm_support')![2]).toMatchObject({ maxAge: 0, path: '/' });
  });

  it('a guest (no Better Auth session) ends nothing but still clears the cookies', async () => {
    m.session = null;
    await endSession();
    expect(m.endOpen).not.toHaveBeenCalled();
    expect(m.set.mock.calls.map((c) => c[0])).toContain('rm_support');
  });
});

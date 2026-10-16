import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: null as null | { user: { id: string; email: string } }, target: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/server/auth', () => ({ auth: () => ({ api: { getSession: async () => m.session } }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'http://localhost:3000' }) }));
vi.mock('@/server/onboarding-start', () => ({ onboardingStartTarget: (...a: unknown[]) => m.target(...a) }));
const { GET } = await import('./route');

beforeEach(() => { m.session = { user: { id: 'u1', email: 'a@b.co' } }; m.target.mockReset(); });

describe('GET /onboarding/start', () => {
  it('not signed in goes to /sign-in', async () => {
    m.session = null;
    const res = await GET();
    expect(res.headers.get('location')).toBe('http://localhost:3000/sign-in');
    expect(m.target).not.toHaveBeenCalled();
  });
  it('sets rm_membership and goes to /onboarding for an open wizard', async () => {
    m.target.mockResolvedValue({ path: '/onboarding', membershipId: 'mem-9' });
    const res = await GET();
    expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding');
    expect(res.cookies.get('rm_membership')?.value).toBe('mem-9');
    expect(m.target).toHaveBeenCalledWith('svc', { id: 'u1', email: 'a@b.co' }, expect.any(Date));
  });
  it('the other targets set no cookie', async () => {
    m.target.mockResolvedValue({ path: '/sign-up/problem' });
    const res = await GET();
    expect(res.headers.get('location')).toBe('http://localhost:3000/sign-up/problem');
    expect(res.cookies.get('rm_membership')).toBeUndefined();
  });
});

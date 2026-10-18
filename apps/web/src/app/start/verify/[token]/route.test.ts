import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('@cs/tools', () => ({ verifyIntake: (...a: unknown[]) => m.verify(...a) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({ service: 'svc' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.test' }) }));
const { GET } = await import('./route');

const call = (token: string, query = '') => GET(new Request(`http://internal/start/verify/${token}${query}`), { params: Promise.resolve({ token }) });

beforeEach(() => m.verify.mockReset());

describe('GET /start/verify/<token>', () => {
  it('a good token redirects to the preview page with the view token; never cached, no referrer', async () => {
    m.verify.mockResolvedValue({ leadId: '11111111-1111-4111-8111-111111111111', viewRaw: 'VIEW_raw-1' });
    const res = await call('RAW', '?from=smith-co');
    expect(m.verify.mock.calls[0]!.slice(0, 2)).toEqual([{ service: 'svc' }, 'RAW']);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.test/start/v/11111111-1111-4111-8111-111111111111?t=VIEW_raw-1');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('expired or used: the expired page, carrying a well-formed origin only', async () => {
    m.verify.mockResolvedValue({ expired: true });
    expect((await call('RAW', '?from=smith-co')).headers.get('location')).toBe('https://app.test/start/verify?from=smith-co');
    expect((await call('RAW', '?from=-')).headers.get('location')).toBe('https://app.test/start/verify?from=-');
    expect((await call('RAW')).headers.get('location')).toBe('https://app.test/start/verify');
    expect((await call('RAW', '?from=https://evil.example')).headers.get('location')).toBe('https://app.test/start/verify?from=-');
  });
});

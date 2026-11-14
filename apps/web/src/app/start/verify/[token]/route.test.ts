import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ verify: vi.fn(), host: { origin: 'https://app.test', info: { kind: 'platform' } } as unknown }));
vi.mock('@cs/tools', () => ({ verifyIntake: (...a: unknown[]) => m.verify(...a) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({ service: 'svc' }) }));
vi.mock('@/server/request-host', () => ({ requestHost: async () => m.host }));
const { GET } = await import('./route');

const call = (token: string, query = '') => GET(new Request(`http://internal/start/verify/${token}${query}`), { params: Promise.resolve({ token }) });

beforeEach(() => {
  m.verify.mockReset();
  m.host = { origin: 'https://app.test', info: { kind: 'platform' } };
});

describe('GET /start/verify/<token>', () => {
  it('a good token redirects to the preview page with the view token; never cached, no referrer', async () => {
    m.verify.mockResolvedValue({ leadId: '11111111-1111-4111-8111-111111111111', viewRaw: 'VIEW_raw-1' });
    const res = await call('RAW', '?from=smith-co');
    expect(m.verify.mock.calls[0]!.slice(0, 2)).toEqual([{ service: 'svc' }, 'RAW']);
    expect(m.verify.mock.calls[0]![3]).toBeUndefined(); // platform host: unscoped
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

  it('13a1 N3: on an agency host the token is scoped to that agency and every redirect stays on the agency origin', async () => {
    m.host = { origin: 'https://acme.neutral.test', info: { kind: 'agency', agencyId: 'A1', canonical: true, canonicalOrigin: 'https://acme.neutral.test' } };
    m.verify.mockResolvedValue({ leadId: '11111111-1111-4111-8111-111111111111', viewRaw: 'V' });
    expect((await call('RAW')).headers.get('location')).toBe('https://acme.neutral.test/start/v/11111111-1111-4111-8111-111111111111?t=V');
    expect(m.verify.mock.calls[0]![3]).toEqual({ agencyId: 'A1' });
    m.verify.mockResolvedValue({ expired: true }); // another agency's (or a pool) token: its usual invalid-token page
    expect((await call('RAW', '?from=smith-co')).headers.get('location')).toBe('https://acme.neutral.test/start/verify?from=smith-co');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@cs/tools', () => ({ confirmWaitlistEmail: (...a: unknown[]) => m.confirm(...a) }));
vi.mock('@/server/tools', () => ({ toolDeps: () => ({ service: 'svc' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.test' }) }));
const { GET } = await import('./route');

const call = (token: string) => GET(new Request(`http://internal/waitlist/confirm/${token}`), { params: Promise.resolve({ token }) });
beforeEach(() => m.confirm.mockReset());

describe('GET /waitlist/confirm/<token>', () => {
  it('valid → /waitlist/confirmed, no-store + no-referrer', async () => {
    m.confirm.mockResolvedValue({ ok: true });
    const res = await call('RAW');
    expect(m.confirm.mock.calls[0]!.slice(0, 2)).toEqual([{ service: 'svc' }, 'RAW']);
    expect(res.headers.get('location')).toBe('https://app.test/waitlist/confirmed');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('expired → ?expired=1, same headers', async () => {
    m.confirm.mockResolvedValue({ expired: true });
    const res = await call('RAW');
    expect(res.headers.get('location')).toBe('https://app.test/waitlist/confirmed?expired=1');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

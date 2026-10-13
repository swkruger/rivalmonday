import { describe, expect, it, vi } from 'vitest';
import { GUEST_COOKIE } from './guest';
import { clearSessionCookies } from './sign-out';
import { SUPPORT_COOKIE } from './support-cookie';
import { MEMBERSHIP_COOKIE } from './viewer';

describe('clearSessionCookies', () => {
  it('deletes the guest, membership-pick and support cookies with a matching path and an expired maxAge', () => {
    const set = vi.fn();
    clearSessionCookies({ set });

    expect(set).toHaveBeenCalledTimes(3);
    const calls = new Map(set.mock.calls.map((c) => [c[0] as string, c[2] as Record<string, unknown>]));

    expect(calls.has(GUEST_COOKIE)).toBe(true);
    expect(calls.has(MEMBERSHIP_COOKIE)).toBe(true);
    expect(calls.has(SUPPORT_COOKIE)).toBe(true);
    for (const opts of calls.values()) {
      expect(opts.path).toBe('/');
      expect(opts.maxAge).toBe(0);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
    }
  });
});

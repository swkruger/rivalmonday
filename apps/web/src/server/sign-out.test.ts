import { describe, expect, it, vi } from 'vitest';
import { GUEST_COOKIE } from './guest';
import { clearSessionCookies } from './sign-out';
import { MEMBERSHIP_COOKIE } from './viewer';

describe('clearSessionCookies', () => {
  it('deletes both the guest and membership-pick cookies with a matching path and an expired maxAge', () => {
    const set = vi.fn();
    clearSessionCookies({ set });

    expect(set).toHaveBeenCalledTimes(2);
    const calls = new Map(set.mock.calls.map((c) => [c[0] as string, c[2] as Record<string, unknown>]));

    expect(calls.has(GUEST_COOKIE)).toBe(true);
    expect(calls.has(MEMBERSHIP_COOKIE)).toBe(true);
    for (const opts of calls.values()) {
      expect(opts.path).toBe('/');
      expect(opts.maxAge).toBe(0);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe('lax');
    }
  });
});

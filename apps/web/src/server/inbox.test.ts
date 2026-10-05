import { createAccessContext } from '@cs/core';
import type { MembershipSummary } from '@cs/tools';
import { describe, expect, it } from 'vitest';
import { inboxOwnerFor, internalLink } from './inbox';
import { safeNext } from './safe-next';

const ctx = createAccessContext({ agencyId: '00000000-0000-4000-8000-00000000000a', userId: 'u', role: 'client_viewer', clientScope: ['00000000-0000-4000-8000-0000000000a1'], features: [] });

describe('inboxOwnerFor', () => {
  it('uses the contact for guests and the user otherwise', () => {
    expect(inboxOwnerFor({ kind: 'guest', contactId: 'c1', ctx })).toEqual({ contactId: 'c1' });
    expect(inboxOwnerFor({ kind: 'user', userId: 'u', email: 'e', name: 'n', ctx, membership: {} as MembershipSummary, memberships: [] })).toEqual({ userId: 'u' });
  });
});

describe('internalLink', () => {
  it('keeps our own links and drops foreign ones', () => {
    expect(internalLink('https://rm.nofingers.ai/l/abc.def', 'https://rm.nofingers.ai')).toBe('/l/abc.def');
    expect(internalLink('https://evil.example/l/abc', 'https://rm.nofingers.ai')).toBe('/inbox');
    expect(internalLink(null, 'https://rm.nofingers.ai')).toBe('/inbox');
    expect(internalLink('not a url', 'https://rm.nofingers.ai')).toBe('/inbox');
  });

  it('can still yield a protocol-relative path for a same-origin link with a doubled slash (m1, final review)', () => {
    // `new URL('https://rm.nofingers.ai//evil.example')` keeps origin `https://rm.nofingers.ai` (host-only) but a
    // `//evil.example` pathname — a browser treats a redirect to that path as going to a different host. This is
    // why `inbox/actions.ts#openNotification` now wraps `internalLink(...)` in `safeNext`, not why this function
    // changed (it is correct for what it checks: same-origin).
    const raw = internalLink('https://rm.nofingers.ai//evil.example', 'https://rm.nofingers.ai');
    expect(raw).toBe('//evil.example');
    expect(safeNext(raw)).toBe('/');
  });
});

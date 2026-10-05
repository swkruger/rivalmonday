import { createAccessContext } from '@cs/core';
import type { MembershipSummary } from '@cs/tools';
import { describe, expect, it } from 'vitest';
import { inboxOwnerFor, internalLink } from './inbox';

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
});

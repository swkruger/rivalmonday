import { createAccessContext } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { maskRecipientsForSupport, maskTeamForSupport } from './support-mask';

const A = '00000000-0000-4000-8000-00000000000a';
const admin = createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: [] });
const support = createAccessContext({
  agencyId: A, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [],
  support: { sessionId: '00000000-0000-4000-8000-0000000005e5', platformUserId: 'op' },
});

const team = {
  members: [
    { membershipId: 'm1', email: 'john@acme.com', name: 'John Smith', role: 'agency_admin' as const },
    { membershipId: 'm2', email: 'ann@b.io', name: '', role: 'client_owner' as const },
    { membershipId: 'm3', email: 'zed@c.io', name: 'zed@c.io', role: 'client_viewer' as const },
  ],
  invitations: [{ id: 'i1', email: 'new@acme.com', role: 'client_viewer' as const }],
};

describe('maskTeamForSupport', () => {
  it('masks member and invitation emails, and names that are emails, inside a support session', () => {
    const out = maskTeamForSupport(support, team);
    expect(out.members.map((m) => [m.email, m.name || m.email])).toEqual([
      ['j•••@acme.com', 'John Smith'],
      ['a•••@b.io', 'a•••@b.io'], // the `name || email` fallback shows the masked email
      ['z•••@c.io', 'z•••@c.io'],
    ]);
    expect(out.invitations[0]).toEqual({ id: 'i1', email: 'n•••@acme.com', role: 'client_viewer' });
    expect(JSON.stringify(out)).not.toMatch(/john@|ann@|zed@|new@/);
  });

  it('returns the data untouched outside a session', () => {
    expect(maskTeamForSupport(admin, team)).toBe(team);
  });
});

describe('maskRecipientsForSupport', () => {
  const rows = [{ contactId: 'c1', email: 'owner@client.com', name: 'Owner', role: 'client_owner', active: true, hasAccount: true }];
  it('masks recipient emails inside a support session', () => {
    expect(maskRecipientsForSupport(support, rows)).toEqual([{ ...rows[0], email: 'o•••@client.com' }]);
  });
  it('returns the rows untouched outside a session', () => {
    expect(maskRecipientsForSupport(admin, rows)).toBe(rows);
  });
});

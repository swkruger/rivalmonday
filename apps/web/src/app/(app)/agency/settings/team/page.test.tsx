// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as unknown, props: [] as unknown[], calls: [] as unknown[][] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer }));
/** 7a2: the page reads through `get_team`; in a support session the registry returns it masked (`supportMask`, tools tests). */
const team = (masked: boolean) => ({
  members: [
    { membershipId: 'm1', userId: 'u1', email: masked ? 'j•••@acme.com' : 'john@acme.com', name: 'John', role: 'agency_admin', clientId: null, clientName: null, clientScope: null },
    { membershipId: 'm2', userId: 'u2', email: masked ? 'a•••@b.io' : 'ann@b.io', name: '', role: 'agency_admin', clientId: null, clientName: null, clientScope: null },
  ],
  invitations: [{ id: 'i1', email: masked ? 'n•••@acme.com' : 'new@acme.com', role: 'agency_admin', clientId: null, clientName: null, expiresAt: new Date('2026-11-01') }],
});
vi.mock('@/server/tools', () => ({
  callTool: async (ctx: { support?: unknown }, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return name === 'get_team' ? team(!!ctx.support) : { items: [] };
  },
}));
vi.mock('./invite-form', () => ({
  InviteForm: (p: unknown) => { m.props.push(p); return null; },
  RemoveMemberButton: (p: unknown) => { m.props.push(p); return null; },
  RevokeInvitationButton: (p: unknown) => { m.props.push(p); return null; },
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import TeamPage from './page';

afterEach(() => { cleanup(); m.props = []; m.calls = []; });
const RAW = /john@acme\.com|ann@b\.io|new@acme\.com/;

describe('TeamPage emails (8b, 7a2)', () => {
  it('reads the team through get_team and passes on only its (masked) emails in a support session — page and client props', async () => {
    m.viewer = { viewer: { kind: 'support' }, ctx: { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } } };
    const { container } = render(await TeamPage());
    expect(container.textContent).toContain('j•••@acme.com');
    expect(container.textContent).toContain('n•••@acme.com');
    expect(container.textContent).not.toMatch(RAW);
    expect(JSON.stringify(m.props)).not.toMatch(RAW);
    expect(m.props).toContainEqual({ membershipId: 'm2', name: 'a•••@b.io' });
    expect(m.calls).toContainEqual(['get_team', {}]);
  });

  it('shows real emails outside a session', async () => {
    m.viewer = { viewer: { kind: 'user' }, ctx: { role: 'agency_admin' } };
    const { container } = render(await TeamPage());
    expect(container.textContent).toContain('john@acme.com');
  });
});

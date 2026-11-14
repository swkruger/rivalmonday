import type { Role } from '@cs/core';
import type { MembershipSummary } from '@cs/tools';
import { describe, expect, it } from 'vitest';
import { decideHost, NO_PLATFORM_BOUNCE, platformBounceTarget } from './host-viewer';
import type { RequestHost } from './request-host';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const PLATFORM = 'https://app.example';
const A_ORIGIN = 'https://acme.neutral.example';
const B_ORIGIN = 'https://bravo.neutral.example';
const platform: RequestHost = { origin: PLATFORM, info: { kind: 'platform' } };
const agencyA: RequestHost = { origin: A_ORIGIN, info: { kind: 'agency', agencyId: A, canonical: true, canonicalOrigin: A_ORIGIN } };
const mcp: RequestHost = { origin: 'https://mcp.neutral.example', info: { kind: 'mcp' } };

let seq = 0;
const mem = (agencyId: string, role: Role): MembershipSummary => ({
  id: `m${++seq}`, agencyId, agencyName: agencyId === A ? 'Acme' : 'Bravo', role,
  clientId: role.startsWith('client_') ? `c${seq}` : null, clientName: null, clientScope: null, contactId: null, createdAt: new Date(2026, 0, seq),
});
const decide = (host: RequestHost, memberships: MembershipSummary[], path = '/c/x', bounce: { origin: string; isOperator: boolean } | null = null) =>
  decideHost({ host, memberships, path, platformOrigin: PLATFORM, bounce });

describe('decideHost (13a1 P7, Appendix E)', () => {
  it('staff on agency host → platform same path', () => {
    expect(decide(agencyA, [mem(A, 'agency_admin')], '/agency/clients?x=1')).toEqual({ kind: 'redirect', to: `${PLATFORM}/agency/clients?x=1` });
    expect(decide(agencyA, [mem(B, 'account_manager')], '/c/x')).toEqual({ kind: 'redirect', to: `${PLATFORM}/c/x` });
  });

  it('client of host agency → only that membership', () => {
    const own = mem(A, 'client_owner');
    const other = mem(B, 'client_viewer');
    expect(decide(agencyA, [other, own])).toEqual({ kind: 'allow', memberships: [own] });
  });

  it('staff + client of host agency → client membership, no bounce', () => {
    const staff = mem(B, 'agency_admin');
    const own = mem(A, 'client_viewer');
    expect(decide(agencyA, [staff, own])).toEqual({ kind: 'allow', memberships: [own] });
  });

  it('client of another agency only → member-less', () => {
    expect(decide(agencyA, [mem(B, 'client_owner')])).toEqual({ kind: 'allow', memberships: [] });
    expect(decide(agencyA, [])).toEqual({ kind: 'allow', memberships: [] });
  });

  it('client-only on platform → picked membership\'s client origin', () => {
    const a = mem(A, 'client_owner');
    const b = mem(B, 'client_owner');
    expect(platformBounceTarget({ host: platform, memberships: [a, b], path: '/c/x', pickedAgencyId: B })).toBe(b);
    expect(platformBounceTarget({ host: platform, memberships: [a, b], path: '/c/x', pickedAgencyId: null })).toBe(a);
    expect(decide(platform, [a, b], '/c/x?tab=1', { origin: B_ORIGIN, isOperator: false })).toEqual({ kind: 'redirect', to: `${B_ORIGIN}/c/x?tab=1` });
  });

  it('mixed staff + client on platform → allow', () => {
    const all = [mem(A, 'client_owner'), mem(B, 'agency_admin')];
    expect(platformBounceTarget({ host: platform, memberships: all, path: '/c/x', pickedAgencyId: A })).toBeNull();
    expect(decide(platform, all)).toEqual({ kind: 'allow', memberships: all });
  });

  it('operator with only client roles stays', () => {
    const all = [mem(A, 'client_owner')];
    expect(decide(platform, all, '/platform', { origin: A_ORIGIN, isOperator: true })).toEqual({ kind: 'allow', memberships: all });
  });

  it('member-less on platform is never bounced', () => {
    expect(platformBounceTarget({ host: platform, memberships: [], path: '/agency', pickedAgencyId: null })).toBeNull();
  });

  it('decideHost never targets the current origin', () => {
    const all = [mem(A, 'client_owner')];
    // A bounce origin equal to the request origin (misconfiguration) allows instead of looping.
    expect(decide(platform, all, '/c/x', { origin: PLATFORM, isOperator: false })).toEqual({ kind: 'allow', memberships: all });
    const hosts = [platform, agencyA, mcp];
    const sets = [[mem(A, 'agency_admin')], [mem(A, 'client_owner')], [mem(B, 'client_owner')], [mem(A, 'client_owner'), mem(B, 'agency_admin')], []];
    const bounces = [null, { origin: A_ORIGIN, isOperator: false }, { origin: PLATFORM, isOperator: false }, { origin: A_ORIGIN, isOperator: true }];
    for (const host of hosts) for (const ms of sets) for (const bounce of bounces) for (const path of ['/', '/c/x?y=1', '//evil.com', '/agency']) {
      const d = decide(host, ms, path, bounce);
      if (d.kind === 'redirect') expect(new URL(d.to).origin).not.toBe(host.origin);
    }
  });

  it('redirect targets keep only a safe same-origin path', () => {
    expect(decide(agencyA, [mem(A, 'agency_admin')], '//evil.com/x')).toEqual({ kind: 'redirect', to: `${PLATFORM}/` });
    expect(decide(platform, [mem(A, 'client_owner')], 'https://evil.com', { origin: A_ORIGIN, isOperator: false })).toEqual({ kind: 'redirect', to: `${A_ORIGIN}/` });
  });

  it('mcp host allows every membership', () => {
    const all = [mem(A, 'agency_admin'), mem(B, 'client_owner')];
    expect(decide(mcp, all)).toEqual({ kind: 'allow', memberships: all });
  });
});

describe('platformBounceTarget (N5)', () => {
  const client = [mem(A, 'client_owner')];

  it('sign-in, start, sample, waitlist paths never bounce', () => {
    for (const path of ['/sign-in', '/sign-in?next=%2Fc%2Fx', '/start', '/start/acme', '/start/v/abc?t=1', '/sample/x', '/waitlist/confirm/t', '/no-access', '/link-expired', '/link-other-account', '/api/ask/turn', '/support/end', '/dev-panel/sign-in/t', '/join/t', '/u/t', '/sign-up', '/onboarding', '/bot']) {
      expect(NO_PLATFORM_BOUNCE.test(path), path).toBe(true);
      expect(platformBounceTarget({ host: platform, memberships: client, path, pickedAgencyId: A }), path).toBeNull();
    }
    for (const path of ['/', '/c/x', '/inbox', '/settings/profile', '/starter', '/sign-income']) {
      expect(platformBounceTarget({ host: platform, memberships: client, path, pickedAgencyId: A }), path).toBe(client[0]);
    }
  });

  it('platformBounceTarget null on agency/mcp hosts', () => {
    expect(platformBounceTarget({ host: agencyA, memberships: client, path: '/c/x', pickedAgencyId: A })).toBeNull();
    expect(platformBounceTarget({ host: mcp, memberships: client, path: '/c/x', pickedAgencyId: A })).toBeNull();
  });
});

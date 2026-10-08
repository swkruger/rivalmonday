import { createAccessContext } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { homePath, navFlagsFor, navFor } from './nav';

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000a1';
const ctx = (role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer') =>
  createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role.startsWith('client') ? [C] : 'all', features: [] });

describe('navFor', () => {
  it('gives admins agency settings', () => {
    expect(navFor({ kind: 'user', ctx: ctx('agency_admin') }, null).map((n) => n.href)).toEqual([
      '/agency', '/agency/approvals', '/agency/alerts', '/agency/prospects', '/agency/usage', '/agency/playbooks', '/inbox', '/agency/team', '/agency/branding', '/agency/webhooks', '/settings/notifications',
    ]);
  });
  it('gives account managers team but not branding/webhooks, plus client pages inside a client', () => {
    const hrefs = navFor({ kind: 'user', ctx: ctx('account_manager') }, C).map((n) => n.href);
    expect(hrefs).toEqual([
      '/agency', '/agency/approvals', '/agency/alerts', '/agency/prospects', '/agency/usage', '/agency/playbooks', `/c/${C}`, `/c/${C}/recommendations`, `/c/${C}/competitors`, `/c/${C}/settings/profile`, `/c/${C}/settings/delivery`,
      '/inbox', '/agency/team', '/settings/notifications',
    ]);
  });
  it('gives client users their overview, inbox and preferences', () => {
    expect(navFor({ kind: 'user', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, `/c/${C}/recommendations`, '/inbox', '/settings/notifications']);
  });
  it('puts every item in the agency, client or account group', () => {
    const groups = (role: Parameters<typeof ctx>[0]) =>
      Object.fromEntries(navFor({ kind: 'user', ctx: ctx(role) }, C).map((n) => [n.href, n.group]));
    expect(groups('agency_admin')).toEqual({
      '/agency': 'agency', '/agency/approvals': 'agency', '/agency/alerts': 'agency', '/agency/prospects': 'agency', '/agency/usage': 'agency', '/agency/playbooks': 'agency',
      [`/c/${C}`]: 'client', [`/c/${C}/recommendations`]: 'client', [`/c/${C}/competitors`]: 'client', [`/c/${C}/settings/profile`]: 'client', [`/c/${C}/settings/delivery`]: 'client',
      '/inbox': 'account', '/agency/team': 'account', '/agency/branding': 'account', '/agency/webhooks': 'account', '/settings/notifications': 'account',
    });
    expect(groups('client_viewer')).toEqual({ [`/c/${C}`]: 'client', [`/c/${C}/recommendations`]: 'client', '/inbox': 'account', '/settings/notifications': 'account' });
  });
  it('gives guests no settings', () => {
    expect(navFor({ kind: 'guest', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, `/c/${C}/recommendations`, '/inbox']);
  });
});

describe('homePath', () => {
  it('routes agency roles to the client list and client roles to their client', () => {
    expect(homePath(ctx('account_manager'))).toBe('/agency');
    expect(homePath(ctx('client_owner'))).toBe(`/c/${C}`);
  });
});

describe('navFlagsFor', () => {
  it('flags platform operators by their signed-in email, never guests', () => {
    const user = { kind: 'user' as const, ctx: ctx('agency_admin'), email: 'someone@e.co' };
    expect(navFlagsFor(user, ['owner@e.co']).isPlatformOperator).toBe(false);
    expect(navFlagsFor({ ...user, email: 'Owner@E.co' }, ['owner@e.co']).isPlatformOperator).toBe(true);
    const guest = { kind: 'guest' as const, ctx: ctx('client_viewer') };
    expect(navFlagsFor(guest, ['owner@e.co']).isPlatformOperator).toBe(false);
  });
});

import { createAccessContext } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { homePath, navFor } from './nav';

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000a1';
const ctx = (role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer') =>
  createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role.startsWith('client') ? [C] : 'all', features: [] });

describe('navFor', () => {
  it('gives admins agency settings', () => {
    expect(navFor({ kind: 'user', ctx: ctx('agency_admin') }, null).map((n) => n.href)).toEqual(['/agency', '/inbox', '/agency/team', '/agency/branding', '/agency/webhooks', '/settings/notifications']);
  });
  it('gives account managers team but not branding/webhooks, plus client pages inside a client', () => {
    const hrefs = navFor({ kind: 'user', ctx: ctx('account_manager') }, C).map((n) => n.href);
    expect(hrefs).toEqual(['/agency', `/c/${C}`, `/c/${C}/settings/delivery`, '/inbox', '/agency/team', '/settings/notifications']);
  });
  it('gives client users their overview, inbox and preferences', () => {
    expect(navFor({ kind: 'user', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, '/inbox', '/settings/notifications']);
  });
  it('gives guests no settings', () => {
    expect(navFor({ kind: 'guest', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, '/inbox']);
  });
});

describe('homePath', () => {
  it('routes agency roles to the client list and client roles to their client', () => {
    expect(homePath(ctx('account_manager'))).toBe('/agency');
    expect(homePath(ctx('client_owner'))).toBe(`/c/${C}`);
  });
});

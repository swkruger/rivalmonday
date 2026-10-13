import { createAccessContext } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { navItemsFor } from '@/components/shell/nav-items';
import { homePath, navFlagsFor, navFor } from './nav';

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000a1';
const ctx = (role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer') =>
  createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role.startsWith('client') ? [C] : 'all', features: [] });

describe('navFor', () => {
  it('gives admins agency settings', () => {
    expect(navFor({ kind: 'user', ctx: ctx('agency_admin') }, null).map((n) => n.href)).toEqual([
      '/agency', '/agency/approvals', '/agency/alerts', '/agency/prospects', '/agency/usage', '/agency/playbooks', '/inbox', '/agency/team', '/agency/ai', '/agency/branding', '/agency/webhooks', '/agency/settings/platform-access', '/settings/notifications',
    ]);
  });
  it('gives account managers team but not branding/webhooks, plus client pages inside a client', () => {
    const hrefs = navFor({ kind: 'user', ctx: ctx('account_manager') }, C).map((n) => n.href);
    expect(hrefs).toEqual([
      '/agency', '/agency/approvals', '/agency/alerts', '/agency/prospects', '/agency/usage', '/agency/playbooks', `/c/${C}`, `/c/${C}/competitors`, `/c/${C}/changes`, `/c/${C}/pricing`, `/c/${C}/ads`, `/c/${C}/reviews`, `/c/${C}/rankings`, `/c/${C}/moves`, `/c/${C}/recommendations`, `/c/${C}/ask`, `/c/${C}/settings/profile`, `/c/${C}/settings/delivery`, `/c/${C}/settings/alerts`, `/c/${C}/settings/ai`,
      '/inbox', '/agency/team', '/agency/ai', '/settings/notifications',
    ]);
  });
  it('gives client users their overview, inbox and preferences', () => {
    expect(navFor({ kind: 'user', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, `/c/${C}/recommendations`, '/inbox', '/settings/notifications']);
  });
  it('gives a client owner with the dashboard feature Competitors, Changes and Moves after Overview', () => {
    const owner = createAccessContext({ agencyId: A, userId: 'u', role: 'client_owner', clientScope: [C], features: ['dashboard'] });
    expect(navFor({ kind: 'user', ctx: owner }, C).map((n) => n.href)).toEqual([`/c/${C}`, `/c/${C}/competitors`, `/c/${C}/changes`, `/c/${C}/pricing`, `/c/${C}/ads`, `/c/${C}/reviews`, `/c/${C}/rankings`, `/c/${C}/moves`, `/c/${C}/recommendations`, `/c/${C}/settings/profile`, '/inbox', '/settings/notifications']);
  });
  it('puts every item in the agency, client or account group', () => {
    const groups = (role: Parameters<typeof ctx>[0]) =>
      Object.fromEntries(navFor({ kind: 'user', ctx: ctx(role) }, C).map((n) => [n.href, n.group]));
    expect(groups('agency_admin')).toEqual({
      '/agency': 'agency', '/agency/approvals': 'agency', '/agency/alerts': 'agency', '/agency/prospects': 'agency', '/agency/usage': 'agency', '/agency/playbooks': 'agency',
      [`/c/${C}`]: 'client', [`/c/${C}/recommendations`]: 'client', [`/c/${C}/ask`]: 'client', [`/c/${C}/competitors`]: 'client', [`/c/${C}/changes`]: 'client', [`/c/${C}/pricing`]: 'client', [`/c/${C}/ads`]: 'client', [`/c/${C}/reviews`]: 'client', [`/c/${C}/rankings`]: 'client', [`/c/${C}/moves`]: 'client', [`/c/${C}/settings/profile`]: 'client', [`/c/${C}/settings/delivery`]: 'client', [`/c/${C}/settings/alerts`]: 'client', [`/c/${C}/settings/ai`]: 'client',
      '/inbox': 'account', '/agency/team': 'account', '/agency/ai': 'account', '/agency/branding': 'account', '/agency/webhooks': 'account', '/agency/settings/platform-access': 'account', '/settings/notifications': 'account',
    });
    expect(groups('client_viewer')).toEqual({ [`/c/${C}`]: 'client', [`/c/${C}/recommendations`]: 'client', '/inbox': 'account', '/settings/notifications': 'account' });
  });
  it('gives guests no settings', () => {
    expect(navFor({ kind: 'guest', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, `/c/${C}/recommendations`, '/inbox']);
  });
});

describe('navFor AI connections', () => {
  it('hides AI connections from guests even when the client has the mcp feature (the token tools refuse guests)', () => {
    const withMcp = createAccessContext({ agencyId: A, userId: 'contact:x', role: 'client_owner', clientScope: [C], features: ['mcp'] });
    expect(navFor({ kind: 'guest', ctx: withMcp }, C).map((n) => n.href)).not.toContain(`/c/${C}/settings/ai`);
    expect(navFor({ kind: 'user', ctx: { ...withMcp, userId: 'u' } }, C).map((n) => n.href)).toContain(`/c/${C}/settings/ai`);
  });
});

describe('navFor Ask', () => {
  const withAsk = (userId = 'u') => createAccessContext({ agencyId: A, userId, role: 'client_viewer', clientScope: [C], features: ['ask'] });

  it('shows "Ask {assistantName}" with the pill after Recommendations, only with the ask feature', () => {
    const items = navFor({ kind: 'user', ctx: withAsk() }, C);
    expect(items.map((n) => n.href)).toEqual([`/c/${C}`, `/c/${C}/recommendations`, `/c/${C}/ask`, '/inbox', '/settings/notifications']);
    expect(items.find((n) => n.href === `/c/${C}/ask`)).toEqual({ href: `/c/${C}/ask`, label: 'Ask Friday', pill: 'Friday', icon: 'ask', group: 'client' });
    expect(navFor({ kind: 'user', ctx: ctx('client_viewer') }, C).map((n) => n.href)).not.toContain(`/c/${C}/ask`);
  });

  it('uses the agency assistant name', () => {
    const flags = navFlagsFor({ kind: 'user', ctx: withAsk() }, false, 'Max');
    expect(flags).toMatchObject({ ask: true, assistantName: 'Max' });
    expect(navItemsFor(flags, C).find((n) => n.icon === 'ask')).toMatchObject({ label: 'Ask Max', pill: 'Max' });
  });

  it('never shows Ask to guests, even with the feature', () => {
    const guestCtx = createAccessContext({ agencyId: A, userId: 'contact:x', role: 'client_owner', clientScope: [C], features: ['ask'] });
    expect(navFlagsFor({ kind: 'guest', ctx: guestCtx }).ask).toBe(false);
    expect(navFor({ kind: 'guest', ctx: guestCtx }, C).map((n) => n.href)).not.toContain(`/c/${C}/ask`);
  });
});

describe('homePath', () => {
  it('routes agency roles to the client list and client roles to their client', () => {
    expect(homePath(ctx('account_manager'))).toBe('/agency');
    expect(homePath(ctx('client_owner'))).toBe(`/c/${C}`);
  });
});

describe('navFlagsFor', () => {
  it('passes the resolved platform-operator flag through for users, never guests', () => {
    const user = { kind: 'user' as const, ctx: ctx('agency_admin'), email: 'someone@e.co' };
    expect(navFlagsFor(user).isPlatformOperator).toBe(false);
    expect(navFlagsFor(user, false).isPlatformOperator).toBe(false);
    expect(navFlagsFor(user, true).isPlatformOperator).toBe(true);
    const guest = { kind: 'guest' as const, ctx: ctx('client_viewer') };
    expect(navFlagsFor(guest, true).isPlatformOperator).toBe(false);
  });

  it('shows the Platform items (Overview, Agencies, queues, Health) only when the flag is true', () => {
    const user = { kind: 'user' as const, ctx: ctx('agency_admin'), email: 'someone@e.co' };
    expect(navFor(user, null).some((n) => n.href.startsWith('/platform'))).toBe(false);
    const platform = navFor(user, null, true).filter((n) => n.href.startsWith('/platform'));
    expect(platform.map((n) => [n.href, n.label])).toEqual([
      ['/platform', 'Overview'], ['/platform/agencies', 'Agencies'], ['/platform/reviews', 'Model reviews'], ['/platform/themes', 'Theme proposals'],
      ['/platform/ask', 'Ask review'], ['/platform/knowledge', 'Knowledge'], ['/platform/health', 'Health'],
    ]);
    expect(platform.every((n) => n.group === 'account')).toBe(true);
  });

  it('passes the client feature flags to the nav (agency roles get every flag)', () => {
    const owner = createAccessContext({ agencyId: A, userId: 'u', role: 'client_owner', clientScope: [C], features: ['dashboard', 'alert_rules'] });
    expect(navFlagsFor({ kind: 'user', ctx: owner, email: 'o@x.test' })).toMatchObject({ dashboard: true, alertRules: true, manageCompetitors: false, mcp: false });
    const am = createAccessContext({ agencyId: A, userId: 'u', role: 'account_manager', clientScope: 'all', features: [] });
    expect(navFlagsFor({ kind: 'user', ctx: am, email: 'am@x.test' })).toMatchObject({ dashboard: true, alertRules: true, manageCompetitors: true, mcp: true });
  });
});

describe('nav inside a support session (Phase 8b)', () => {
  const support = { kind: 'support' as const, ctx: createAccessContext({ agencyId: A, userId: 'op', role: 'agency_admin', clientScope: 'all', features: ['ask'], support: { sessionId: 's', platformUserId: 'op' } }) };

  it('shows "Back to platform" to the agency console page, no Platform access, no Notifications, no platform items', () => {
    const items = navItemsFor({ ...navFlagsFor(support, true), backToPlatform: `/platform/agencies/${A}` }, C);
    const hrefs = items.map((n) => n.href);
    expect(items.find((n) => n.label === 'Back to platform')).toMatchObject({ href: `/platform/agencies/${A}`, group: 'account' });
    expect(hrefs).not.toContain('/agency/settings/platform-access');
    expect(hrefs).not.toContain('/settings/notifications');
    expect(hrefs).not.toContain('/platform');
  });

  it('hides the Inbox item (M2: the operator inbox 404s in a session) but keeps it for users and guests', () => {
    expect(navFlagsFor(support).inbox).toBe(false);
    expect(navFor(support, C).map((n) => n.href)).not.toContain('/inbox');
    expect(navFor({ kind: 'user', ctx: ctx('agency_admin') }, C).map((n) => n.href)).toContain('/inbox');
    expect(navFor({ kind: 'guest', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toContain('/inbox');
  });

  it('keeps the Ask module (it shows the private-conversations copy)', () => {
    expect(navFor(support, C).map((n) => n.href)).toContain(`/c/${C}/ask`);
  });
});

import { createAccessContext } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { settingsNavFor } from '@/components/shell/nav-items';
import { homePath, navFlagsFor, navForViewer } from './nav';

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000a1';
const ctx = (role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer') =>
  createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role.startsWith('client') ? [C] : 'all', features: [] });
const hrefs = (s: { items: { href: string }[] }[]) => s.flatMap((x) => x.items.map((i) => i.href));
const labelsOf = (s: { items: { label: string }[] }[]) => s.flatMap((x) => x.items.map((i) => i.label));

describe('Phase 11c leads flag', () => {
  it('is set for agency users who cover all clients, not for client roles', () => {
    expect(navFlagsFor({ kind: 'user', ctx: ctx('agency_admin') }).leads).toBe(true);
    expect(navFlagsFor({ kind: 'user', ctx: ctx('account_manager') }).leads).toBe(true);
    expect(navFlagsFor({ kind: 'user', ctx: ctx('client_owner') }).leads).toBe(false);
  });
  it('limited-scope account managers do not get Leads', () => {
    const am = createAccessContext({ agencyId: A, userId: 'u', role: 'account_manager', clientScope: [C], features: [] });
    expect(navFlagsFor({ kind: 'user', ctx: am }).leads).toBe(false);
    expect(hrefs(navForViewer({ kind: 'user', ctx: am }, 'agency', null))).not.toContain('/agency/leads');
    expect(hrefs(navForViewer({ kind: 'user', ctx: ctx('account_manager') }, 'agency', null))).toContain('/agency/leads');
  });
  it('puts the leads count on the Leads item', () => {
    const s = navForViewer({ kind: 'user', ctx: ctx('agency_admin') }, 'agency', null, false, false, { leads: 2 });
    expect(s.flatMap((x) => x.items).find((i) => i.href === '/agency/leads')).toMatchObject({ label: 'Leads', count: 2 });
  });
});

describe('navForViewer', () => {
  it("agency view for admins and account managers is the same grouped menu (settings opens the viewer's first tab)", () => {
    const expected = ['/agency', '/agency/approvals', '/agency/alerts', '/agency/prospects', '/agency/leads'];
    expect(hrefs(navForViewer({ kind: 'user', ctx: ctx('agency_admin') }, 'agency', null))).toEqual([...expected, '/agency/settings/branding']);
    expect(hrefs(navForViewer({ kind: 'user', ctx: ctx('account_manager') }, 'agency', C))).toEqual([...expected, '/agency/settings/team']);
  });

  it('client view for an agency role covers the open client, Ask first (agency roles have every feature)', () => {
    expect(hrefs(navForViewer({ kind: 'user', ctx: ctx('account_manager') }, 'client', C))).toEqual([
      `/c/${C}/ask`, `/c/${C}`, `/c/${C}/competitors`, `/c/${C}/changes`, `/c/${C}/pricing`, `/c/${C}/ads`, `/c/${C}/reviews`, `/c/${C}/rankings`, `/c/${C}/moves`, `/c/${C}/recommendations`, `/c/${C}/briefs`, `/c/${C}/settings/profile`,
    ]);
  });

  it('client viewer: Overview and Act only, no Inbox or Notifications in the menu', () => {
    expect(hrefs(navForViewer({ kind: 'user', ctx: ctx('client_viewer') }, 'client', C))).toEqual([`/c/${C}`, `/c/${C}/recommendations`, `/c/${C}/briefs`]);
  });

  it('client owner with the dashboard feature gets Insights and Client settings', () => {
    const owner = createAccessContext({ agencyId: A, userId: 'u', role: 'client_owner', clientScope: [C], features: ['dashboard'] });
    const s = navForViewer({ kind: 'user', ctx: owner }, 'client', C);
    expect(s.map((x) => x.id)).toEqual(['top', 'insights', 'act', 'foot']);
    expect(hrefs(settingsNavFor('client', navFlagsFor({ kind: 'user', ctx: owner }), C))).toEqual([`/c/${C}/settings/profile`]);
  });

  it('guests never get Client settings', () => {
    const g = createAccessContext({ agencyId: A, userId: 'contact:x', role: 'client_owner', clientScope: [C], features: ['dashboard', 'alert_rules'] });
    expect(hrefs(navForViewer({ kind: 'guest', ctx: g }, 'client', C)).filter((h) => h.includes('/settings'))).toEqual([]);
  });
});

describe('client AI connection tab', () => {
  it('is hidden from guests even when the client has the mcp feature (the token tools refuse guests)', () => {
    const withMcp = createAccessContext({ agencyId: A, userId: 'contact:x', role: 'client_owner', clientScope: [C], features: ['mcp'] });
    expect(settingsNavFor('client', navFlagsFor({ kind: 'guest', ctx: withMcp }), C)).toEqual([]);
    expect(hrefs(settingsNavFor('client', navFlagsFor({ kind: 'user', ctx: { ...withMcp, userId: 'u' } }), C))).toEqual([`/c/${C}/settings/ai`]);
  });
});

describe('Ask', () => {
  const withAsk = (userId = 'u') => createAccessContext({ agencyId: A, userId, role: 'client_viewer', clientScope: [C], features: ['ask'] });

  it('shows "Ask {assistantName}" with the pill first in the client view, only with the ask feature', () => {
    const s = navForViewer({ kind: 'user', ctx: withAsk() }, 'client', C);
    expect(s[0]!.items[0]).toEqual({ href: `/c/${C}/ask`, label: 'Ask Friday', pill: 'Friday', icon: 'ask' });
    expect(hrefs(navForViewer({ kind: 'user', ctx: ctx('client_viewer') }, 'client', C))).not.toContain(`/c/${C}/ask`);
  });

  it('uses the agency assistant name', () => {
    const flags = navFlagsFor({ kind: 'user', ctx: withAsk() }, false, 'Max');
    expect(flags).toMatchObject({ ask: true, assistantName: 'Max' });
  });

  it('never shows Ask to guests, even with the feature', () => {
    const guestCtx = createAccessContext({ agencyId: A, userId: 'contact:x', role: 'client_owner', clientScope: [C], features: ['ask'] });
    expect(navFlagsFor({ kind: 'guest', ctx: guestCtx }).ask).toBe(false);
    expect(hrefs(navForViewer({ kind: 'guest', ctx: guestCtx }, 'client', C))).not.toContain(`/c/${C}/ask`);
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

  it('platform view only for operators; Costs only for the owner', () => {
    const user = { kind: 'user' as const, ctx: ctx('agency_admin'), email: 'someone@e.co' };
    expect(navForViewer(user, 'platform', null)).toEqual([]);
    expect(labelsOf(navForViewer(user, 'platform', null, true))).toEqual(['Overview', 'Agencies', 'Lead pool', 'Billing & plans', 'Model reviews', 'Topic proposals', 'Ask reviews', 'Knowledge', 'Business types', 'Runbook']);
    expect(hrefs(navForViewer(user, 'platform', null, true, false))).not.toContain('/platform/costs');
    expect(hrefs(navForViewer(user, 'platform', null, false, true))).toEqual([]);
    expect(navForViewer(user, 'platform', null, true, true).at(-1)).toMatchObject({ id: 'system', items: [{ href: '/platform/costs', label: 'Costs', icon: 'costs' }] });
  });

  it('passes the client feature flags to the nav (agency roles get every flag); manageCompetitors is gone', () => {
    const owner = createAccessContext({ agencyId: A, userId: 'u', role: 'client_owner', clientScope: [C], features: ['dashboard', 'alert_rules'] });
    const ownerFlags = navFlagsFor({ kind: 'user', ctx: owner, email: 'o@x.test' });
    expect(ownerFlags).toMatchObject({ dashboard: true, alertRules: true, mcp: false });
    expect(ownerFlags).not.toHaveProperty('manageCompetitors');
    const am = createAccessContext({ agencyId: A, userId: 'u', role: 'account_manager', clientScope: 'all', features: [] });
    expect(navFlagsFor({ kind: 'user', ctx: am, email: 'am@x.test' })).toMatchObject({ dashboard: true, alertRules: true, mcp: true });
  });
});

describe('nav inside a support session (Phase 8b)', () => {
  const support = { kind: 'support' as const, ctx: createAccessContext({ agencyId: A, userId: 'op', role: 'agency_admin', clientScope: 'all', features: ['ask'], support: { sessionId: 's', platformUserId: 'op' } }) };

  it('agency settings omit Billing, Intake link and Platform access; no platform view; no Back to platform item', () => {
    const flags = { ...navFlagsFor(support, true), backToPlatform: `/platform/agencies/${A}` };
    expect(labelsOf(settingsNavFor('agency', flags))).toEqual(['Branding & voice', 'Team', 'Runbook', 'Usage & limits', 'Slack & Teams', 'AI connections']);
    expect(navForViewer(support, 'platform', null, true)).toEqual([]);
    expect(hrefs(navForViewer(support, 'agency', null, true))).not.toContain(`/platform/agencies/${A}`);
  });

  it('keeps the inbox flag off for Task 5 (M2: the operator inbox 404s in a session) and on for users and guests', () => {
    expect(navFlagsFor(support).inbox).toBe(false);
    expect(navFlagsFor({ kind: 'user', ctx: ctx('agency_admin') }).inbox).toBe(true);
    expect(navFlagsFor({ kind: 'guest', ctx: ctx('client_viewer') }).inbox).toBe(true);
  });

  it('shows the AI connection settings tab (the page serves support read-only) without widening the sidebar `mcp` flag', () => {
    expect(navFlagsFor(support).mcp).toBe(false);
    expect(hrefs(settingsNavFor('client', navFlagsFor(support), C))).toContain(`/c/${C}/settings/ai`);
    const guest = { kind: 'guest' as const, ctx: ctx('client_owner') };
    expect(hrefs(settingsNavFor('client', navFlagsFor(guest), C))).not.toContain(`/c/${C}/settings/ai`);
  });

  it('keeps the Ask module (it shows the private-conversations copy) and Client settings', () => {
    const s = navForViewer(support, 'client', C);
    expect(hrefs(s)).toContain(`/c/${C}/ask`);
    expect(hrefs(s)).toContain(`/c/${C}/settings/profile`);
  });
});

describe('client Billing tab (9b)', () => {
  it('shows last only when flagged (client owner with billing on); never for agency roles', () => {
    const flags = { ...navFlagsFor({ kind: 'user', ctx: ctx('client_owner') }), clientBilling: true };
    expect(settingsNavFor('client', flags, C)[0]!.items.at(-1)).toMatchObject({ href: `/c/${C}/settings/billing`, label: 'Billing' });
    expect(settingsNavFor('client', navFlagsFor({ kind: 'user', ctx: ctx('client_owner') }), C)).toEqual([]);
    const agency = settingsNavFor('client', { ...navFlagsFor({ kind: 'user', ctx: ctx('agency_admin') }), clientBilling: true }, C);
    expect(hrefs(agency)).not.toContain(`/c/${C}/settings/billing`);
  });
});

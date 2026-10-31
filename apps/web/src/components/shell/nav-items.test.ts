import { describe, expect, it } from 'vitest';
import { activeHref, canSeeClientSettings, clientSettingsNavFor, currentSettingsHref, type NavRoleFlags, type NavSection, navFor, pageIdOf, settingsAreaOf, settingsNavFor, showsClientBilling } from './nav-items';

const C = '00000000-0000-4000-8000-0000000000a1';
const B = `/c/${C}`;

// Shapes `navFlagsFor` produces (server/nav.ts) for each viewer, written out so this file stays pure.
const agencyAdmin: NavRoleFlags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true, ask: true, assistantName: 'Friday', inbox: true, leads: true };
const accountManager: NavRoleFlags = { ...agencyAdmin, isAgencyAdmin: false };
const scopedAm: NavRoleFlags = { ...accountManager, leads: false };
const operator: NavRoleFlags = { ...agencyAdmin, isPlatformOperator: true, isPlatformOwner: false };
const platformOwner: NavRoleFlags = { ...operator, isPlatformOwner: true };
const clientOwner: NavRoleFlags = { isAgency: false, isAgencyAdmin: false, isUser: true, homePath: B, dashboard: true, alertRules: true, mcp: true, ask: true, assistantName: 'Friday', inbox: true, leads: false, usage: true };
const clientViewer: NavRoleFlags = { ...clientOwner, dashboard: false, alertRules: false, mcp: false, ask: false, usage: false };
const guest: NavRoleFlags = { ...clientOwner, isUser: false, mcp: false, ask: false, usage: false };
const support: NavRoleFlags = { ...agencyAdmin, isUser: false, inbox: false, backToPlatform: '/platform/agencies/x' };

const ids = (s: NavSection[]) => s.map((x) => x.id);
const labels = (s: NavSection[]) => s.map((x) => [x.id, x.label, x.items.map((i) => i.label)]);
const hrefs = (s: NavSection[]) => s.flatMap((x) => x.items.map((i) => i.href));
const item = (s: NavSection[], label: string) => s.flatMap((x) => x.items).find((i) => i.label === label);

describe('navFor platform', () => {
  it('gives an operator the platform groups in spec order, Costs hidden for staff', () => {
    const s = navFor('platform', operator, null);
    expect(labels(s)).toEqual([
      ['top', null, ['Overview']],
      ['customers', 'Customers', ['Agencies', 'Lead pool', 'Waitlist']],
      ['revenue', 'Revenue', ['Billing & plans']],
      ['quality', 'Quality', ['Model reviews', 'Topic proposals', 'Ask reviews']],
      ['content', 'Content', ['Knowledge', 'Business types', 'Runbook']],
    ]);
    expect(hrefs(s)).toEqual(['/platform', '/platform/agencies', '/platform/leads', '/platform/waitlist', '/platform/billing', '/platform/reviews', '/platform/topics', '/platform/ask', '/platform/knowledge', '/platform/verticals', '/platform/runbook']);
    expect(s[0]!.placement).toBe('top');
  });

  it('adds System › Costs for the platform owner only', () => {
    const s = navFor('platform', platformOwner, null);
    expect(ids(s)).toEqual(['top', 'customers', 'revenue', 'quality', 'content', 'system']);
    expect(s.at(-1)).toMatchObject({ id: 'system', label: 'System', items: [{ href: '/platform/costs', label: 'Costs', icon: 'costs' }] });
  });

  it('never lists Health', () => {
    expect(hrefs(navFor('platform', platformOwner, null))).not.toContain('/platform/health');
  });

  it('is empty for non-operators (owner flag alone is not enough)', () => {
    expect(navFor('platform', agencyAdmin, null)).toEqual([]);
    expect(navFor('platform', { ...agencyAdmin, isPlatformOwner: true }, null)).toEqual([]);
    expect(navFor('platform', clientOwner, null)).toEqual([]);
  });

  it('shows Waitlist with its badge for operators only', () => {
    expect(item(navFor('platform', operator, null, { waitlist: 3 }), 'Waitlist')).toMatchObject({ href: '/platform/waitlist', icon: 'waitlist', count: 3 });
    expect(item(navFor('platform', operator, null, { waitlist: 0 }), 'Waitlist')).not.toHaveProperty('count');
    expect(item(navFor('platform', operator, null), 'Waitlist')).not.toHaveProperty('count');
    for (const flags of [agencyAdmin, clientOwner]) {
      for (const ctx of ['platform', 'agency', 'client'] as const) expect(hrefs(navFor(ctx, flags, 'c1', { waitlist: 3 }))).not.toContain('/platform/waitlist');
    }
  });

  it('puts queue counts on the quality items and hides badges at 0', () => {
    const s = navFor('platform', operator, null, { modelReviews: 4, topics: 0 });
    expect(item(s, 'Model reviews')).toMatchObject({ count: 4 });
    expect(item(s, 'Topic proposals')).not.toHaveProperty('count');
    expect(item(s, 'Ask reviews')).not.toHaveProperty('count'); // no Ask reviews badge (no reviewed state to count)
    expect(item(navFor('platform', operator, null), 'Model reviews')).not.toHaveProperty('count');
  });
});

describe('navFor agency', () => {
  it('gives an agency admin Portfolio, Work, Growth and the Agency settings foot', () => {
    const s = navFor('agency', agencyAdmin, null);
    expect(labels(s)).toEqual([
      ['top', null, ['Portfolio']],
      ['work', 'Work', ['Approvals', 'Alert review']],
      ['growth', 'Growth', ['Prospects', 'Leads']],
      ['foot', null, ['Agency settings']],
    ]);
    expect(hrefs(s)).toEqual(['/agency', '/agency/approvals', '/agency/alerts', '/agency/prospects', '/agency/leads', '/agency/settings/branding']);
    expect(s.at(-1)!.placement).toBe('foot');
    expect(item(s, 'Agency settings')!.icon).toBe('settings');
  });

  it('shows Leads to AMs who cover every client, not to scoped AMs', () => {
    expect(hrefs(navFor('agency', accountManager, null))).toContain('/agency/leads');
    const scoped = navFor('agency', scopedAm, null);
    expect(labels(scoped).find(([id]) => id === 'growth')).toEqual(['growth', 'Growth', ['Prospects']]);
  });

  it('has no Inbox, Notifications, Back to platform or settings pages in the menu', () => {
    const all = hrefs(navFor('agency', support, null));
    for (const h of ['/inbox', '/settings/notifications', '/platform/agencies/x', '/agency/team', '/agency/usage']) expect(all).not.toContain(h);
    expect(all.filter((h) => h.startsWith('/agency/settings'))).toHaveLength(1);
  });

  it('links Agency settings to the first tab the viewer can see', () => {
    expect(item(navFor('agency', agencyAdmin, null), 'Agency settings')).toMatchObject({ href: '/agency/settings/branding', match: '/agency/settings' });
    expect(item(navFor('agency', accountManager, null), 'Agency settings')!.href).toBe('/agency/settings/team');
  });

  it('puts counts on Approvals, Alert review and Leads; hides zero and missing counts', () => {
    const s = navFor('agency', agencyAdmin, null, { approvals: 3, alerts: 0, leads: 5 });
    expect(item(s, 'Approvals')).toMatchObject({ count: 3 });
    expect(item(s, 'Alert review')).not.toHaveProperty('count');
    expect(item(s, 'Leads')).toMatchObject({ count: 5 });
    expect(item(navFor('agency', agencyAdmin, null, {}), 'Approvals')).not.toHaveProperty('count');
  });

  it('is empty for client roles', () => {
    expect(navFor('agency', clientOwner, null)).toEqual([]);
  });
});

describe('navFor client', () => {
  const insights = ['Competitors', 'Changes', 'Pricing', 'Ads', 'Reviews', 'Local rankings', 'Moves'];

  it('agency admin: Ask first, Overview, Insights, Act, Client settings foot', () => {
    const s = navFor('client', agencyAdmin, C);
    expect(labels(s)).toEqual([
      ['top', null, ['Ask Friday', 'Overview']],
      ['insights', 'Insights', insights],
      ['act', 'Act', ['Recommendations', 'Briefs & reports']],
      ['foot', null, ['Client settings']],
    ]);
    expect(hrefs(s)).toEqual([`${B}/ask`, B, `${B}/competitors`, `${B}/changes`, `${B}/pricing`, `${B}/ads`, `${B}/reviews`, `${B}/rankings`, `${B}/moves`, `${B}/recommendations`, `${B}/briefs`, `${B}/settings/profile`]);
    expect(s[0]!.items[0]).toEqual({ href: `${B}/ask`, label: 'Ask Friday', pill: 'Friday', icon: 'ask' });
    expect(item(s, 'Briefs & reports')!.icon).toBe('briefs');
  });

  it('uses the agency assistant name, falling back to Friday when blank', () => {
    expect(item(navFor('client', { ...agencyAdmin, assistantName: 'Max' }, C), 'Ask Max')).toMatchObject({ pill: 'Max' });
    expect(item(navFor('client', { ...agencyAdmin, assistantName: '  ' }, C), 'Ask Friday')).toMatchObject({ pill: 'Friday' });
  });

  it('is empty for an agency role with no client open', () => {
    expect(navFor('client', agencyAdmin, null)).toEqual([]);
  });

  it('client owner: their own client (homePath), Client settings when any tab is visible', () => {
    const s = navFor('client', clientOwner, null);
    expect(ids(s)).toEqual(['top', 'insights', 'act', 'foot']);
    expect(hrefs(s)[1]).toBe(B);
    expect(item(s, 'Client settings')!.href).toBe(`${B}/settings/profile`);
  });

  it('client viewer without dashboard: no Insights, no Ask, no settings foot when no tab is visible', () => {
    const s = navFor('client', clientViewer, C);
    expect(labels(s)).toEqual([
      ['top', null, ['Overview']],
      ['act', 'Act', ['Recommendations', 'Briefs & reports']],
    ]);
  });

  it('client viewer with only alert rules still gets Client settings', () => {
    expect(ids(navFor('client', { ...clientViewer, alertRules: true }, C))).toContain('foot');
  });

  it('guest: no Ask and never Client settings, even with visible tabs', () => {
    const s = navFor('client', guest, C);
    expect(ids(s)).toEqual(['top', 'insights', 'act']);
    expect(labels(s)[0]).toEqual(['top', null, ['Overview']]);
    expect(settingsNavFor('client', guest, C).length).toBeGreaterThan(0);
  });

  it('support session: client view keeps Ask and Client settings', () => {
    const s = navFor('client', { ...support, ask: true }, C);
    expect(s[0]!.items.map((i) => i.label)).toEqual(['Ask Friday', 'Overview']);
    expect(ids(s)).toContain('foot');
  });

  it('has no badges in the client view', () => {
    expect(navFor('client', agencyAdmin, C, { approvals: 3, alerts: 2, leads: 1 }).flatMap((x) => x.items).some((i) => 'count' in i)).toBe(false);
  });
});

describe('settingsNavFor agency', () => {
  it('agency admin: every group and tab in spec order with the settings routes', () => {
    const s = settingsNavFor('agency', agencyAdmin);
    expect(labels(s)).toEqual([
      ['agency', 'Agency', ['Branding & voice', 'Team', 'Runbook']],
      ['plan', 'Plan', ['Billing', 'Usage & limits']],
      ['growth', 'Growth', ['Intake link']],
      ['integrations', 'Integrations', ['Slack & Teams', 'AI connections']],
      ['security', 'Security', ['Platform access']],
    ]);
    expect(hrefs(s)).toEqual([
      '/agency/settings/branding', '/agency/settings/team', '/agency/settings/runbook',
      '/agency/settings/billing', '/agency/settings/usage',
      '/agency/settings/intake',
      '/agency/settings/slack-teams', '/agency/settings/ai',
      '/agency/settings/platform-access',
    ]);
  });

  it('account manager: no Branding, Billing, Intake, Slack & Teams or Platform access; empty groups dropped', () => {
    expect(labels(settingsNavFor('agency', accountManager))).toEqual([
      ['agency', 'Agency', ['Team', 'Runbook']],
      ['plan', 'Plan', ['Usage & limits']],
      ['integrations', 'Integrations', ['AI connections']],
    ]);
  });

  it('support session: no Billing, Intake link or Platform access (they 404 in a session)', () => {
    expect(labels(settingsNavFor('agency', support))).toEqual([
      ['agency', 'Agency', ['Branding & voice', 'Team', 'Runbook']],
      ['plan', 'Plan', ['Usage & limits']],
      ['integrations', 'Integrations', ['Slack & Teams', 'AI connections']],
    ]);
  });

  it('is empty for client roles', () => {
    expect(settingsNavFor('agency', clientOwner)).toEqual([]);
  });
});

describe('settingsNavFor client', () => {
  it('agency roles: Business profile, Delivery, Alert rules, Runbook, AI connection; never client Billing', () => {
    const s = settingsNavFor('client', { ...agencyAdmin, clientBilling: true }, C);
    expect(labels(s)).toEqual([['main', null, ['Business profile', 'Delivery', 'Alert rules', 'Runbook', 'AI connection', 'Usage']]]);
    expect(hrefs(s)).toEqual([`${B}/settings/profile`, `${B}/settings/delivery`, `${B}/settings/alerts`, `${B}/settings/runbook`, `${B}/settings/ai`, `${B}/settings/usage`]);
  });

  it('client owner: Billing only while billing is on', () => {
    expect(labels(settingsNavFor('client', clientOwner, C))).toEqual([['main', null, ['Business profile', 'Alert rules', 'AI connection', 'Usage']]]);
    const on = settingsNavFor('client', { ...clientOwner, clientBilling: true }, C);
    expect(on[0]!.items.map((i) => i.label)).toEqual(['Business profile', 'Alert rules', 'AI connection', 'Usage', 'Billing']);
    expect(on[0]!.items.at(-1)!.href).toBe(`${B}/settings/billing`);
  });

  it('Usage tab: agency roles and the client owner; never a viewer or a guest', () => {
    expect(settingsNavFor('client', clientViewer, C)).toEqual([]);
    expect(settingsNavFor('client', { ...clientViewer, alertRules: true }, C)[0]!.items.map((i) => i.label)).toEqual(['Alert rules']);
    expect(settingsNavFor('client', guest, C)[0]!.items.map((i) => i.label)).not.toContain('Usage');
  });

  it('client viewer without features: nothing', () => {
    expect(settingsNavFor('client', clientViewer, C)).toEqual([]);
  });

  it('client roles use their own client even without a clientId; agency roles need one', () => {
    expect(hrefs(settingsNavFor('client', clientOwner))[0]).toBe(`${B}/settings/profile`);
    expect(settingsNavFor('client', agencyAdmin)).toEqual([]);
  });
});

describe('activeHref', () => {
  const s = navFor('client', agencyAdmin, C);

  it('picks the longest matching href', () => {
    expect(activeHref(s, B)).toBe(B);
    expect(activeHref(s, `${B}/briefs/abc`)).toBe(`${B}/briefs`);
    expect(activeHref(navFor('agency', agencyAdmin, null), '/agency/approvals/x')).toBe('/agency/approvals');
  });

  it('highlights a settings entry (linked to its first tab) on every tab and on the bare index', () => {
    expect(activeHref(s, `${B}/settings/delivery`)).toBe(`${B}/settings/profile`);
    expect(activeHref(s, `${B}/settings`)).toBe(`${B}/settings/profile`);
    expect(activeHref(navFor('agency', agencyAdmin, null), '/agency/settings/team')).toBe('/agency/settings/branding');
    expect(activeHref(navFor('agency', agencyAdmin, null), '/agency/settings')).toBe('/agency/settings/branding');
  });

  it('ignores query strings and does not match on partial segments', () => {
    expect(activeHref(s, `${B}/briefs?tab=alerts`)).toBe(`${B}/briefs`);
    expect(activeHref(s, `${B}/briefsx`)).toBeNull();
    expect(activeHref(s, '/inbox')).toBeNull();
  });

  it('lights Overview only on its own path, not on pages with no menu entry of their own', () => {
    expect(activeHref(s, B)).toBe(B);
    expect(activeHref(s, `${B}/evidence/e1`)).toBeNull();
    expect(activeHref(s, `${B}/help`)).toBeNull();
    expect(activeHref(navFor('platform', operator, null), '/platform')).toBe('/platform');
    expect(activeHref(navFor('platform', operator, null), '/platform/health')).toBeNull();
  });
});

describe('pageIdOf (15b-1 help page ids)', () => {
  it('maps menu hrefs to dot-separated page ids, roots included', () => {
    expect(pageIdOf('client', '/c/00000000-0000-4000-8000-0000000000c1')).toBe('client.overview');
    expect(pageIdOf('client', '/c/00000000-0000-4000-8000-0000000000c1/reviews')).toBe('client.reviews');
    expect(pageIdOf('client', '/c/00000000-0000-4000-8000-0000000000c1/settings/profile')).toBe('client.settings.profile');
    expect(pageIdOf('agency', '/agency')).toBe('agency.portfolio');
    expect(pageIdOf('agency', '/agency/settings/slack-teams')).toBe('agency.settings.slack-teams');
    expect(pageIdOf('platform', '/platform')).toBe('platform.overview');
    expect(pageIdOf('platform', '/platform/agencies?x=1')).toBe('platform.agencies');
  });
});

describe('showsClientBilling', () => {
  it('is true only for client_owner with billing enabled', () => {
    expect(showsClientBilling('client_owner', { enabled: true })).toBe(true);
    expect(showsClientBilling('client_owner', { enabled: false })).toBe(false);
    expect(showsClientBilling('client_owner', null)).toBe(false);
    expect(showsClientBilling('client_owner', undefined)).toBe(false);
    for (const r of ['agency_admin', 'account_manager', 'client_viewer'] as const) expect(showsClientBilling(r, { enabled: true })).toBe(false);
  });
});

describe('settingsAreaOf (16b drill-in)', () => {
  it('finds the agency and client settings areas, query and hash ignored', () => {
    expect(settingsAreaOf('/agency/settings')).toEqual({ area: 'agency' });
    expect(settingsAreaOf('/agency/settings/team?x=1')).toEqual({ area: 'agency' });
    expect(settingsAreaOf(`${B}/settings`)).toEqual({ area: 'client', clientId: C });
    expect(settingsAreaOf(`${B}/settings/billing#a`)).toEqual({ area: 'client', clientId: C });
  });

  it('is null outside a settings area (partial segments, the personal settings)', () => {
    expect(settingsAreaOf('/agency/settingsx')).toBeNull();
    expect(settingsAreaOf(`${B}/settingsx`)).toBeNull();
    expect(settingsAreaOf('/settings/notifications')).toBeNull();
    expect(settingsAreaOf('/agency')).toBeNull();
    expect(settingsAreaOf(B)).toBeNull();
  });
});

describe('currentSettingsHref', () => {
  const s = settingsNavFor('agency', agencyAdmin);
  it('is the active tab, else the first tab (the bare index only redirects)', () => {
    expect(currentSettingsHref(s, '/agency/settings/billing/client-billing')).toBe('/agency/settings/billing');
    expect(currentSettingsHref(s, '/agency/settings')).toBe('/agency/settings/branding');
    expect(currentSettingsHref([], '/agency/settings')).toBeNull();
  });
});

describe('canSeeClientSettings / clientSettingsNavFor (16c: one rule)', () => {
  it('guests never see client settings', () => {
    expect(canSeeClientSettings(guest)).toBe(false);
    expect(clientSettingsNavFor(guest, C)).toEqual([]);
  });
  it('staff (incl. support) and signed-in client roles get settingsNavFor(client)', () => {
    for (const f of [agencyAdmin, accountManager, support, clientOwner, { ...clientOwner, clientBilling: true }, clientViewer]) {
      expect(canSeeClientSettings(f)).toBe(true);
      expect(clientSettingsNavFor(f, C)).toEqual(settingsNavFor('client', f, C));
    }
  });
});

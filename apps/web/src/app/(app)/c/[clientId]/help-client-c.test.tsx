// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

/**
 * 15b-2 Task 6, client batch C (Setup, Business profile, Delivery, Alert rules, AI connection, Billing, Runbook): the
 * Guide button follows `list_help_guides` for the client scope, tips and empty states follow the viewer's audience, and
 * copy is rendered with the viewer's names. Delivery and Runbook are agency-only (a client role gets a 404), Billing is
 * client-owner-only (an agency role gets a 404), and a client never reads agency wording or a platform name.
 */
const C = '00000000-0000-4000-8000-0000000000c1';
const m = vi.hoisted(() => ({
  role: 'client_owner', features: ['dashboard', 'alert_rules', 'mcp'] as string[], guides: [] as string[], calls: [] as [string, unknown][],
  recipients: true, tokens: true, grants: true, billingState: 'active', setupOpen: true,
}));

// The real Switch in the delivery form measures itself with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: m.role, userId: 'u1', agencyId: 'a1', clientScope: [C], features: new Set(m.features), planFeatures: new Set(['ask', 'mcp']) } }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Cool Comfort' } }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.test' }) }));
vi.mock('@/server/timezones', () => ({ timezoneOptions: () => ['America/Chicago'] }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC & Plumbing', services: [{ id: 'ac_repair', name: 'AC repair' }] }] }));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('@/components/billing/client-billing-controls', () => ({ ClientBillingControls: () => null }));
vi.mock('@/components/runbook/runbook-editor', () => ({ RunbookEditor: () => <div>runbook editor</div> }));
vi.mock('@/components/client-profile-form', () => ({ ClientProfileForm: () => <div>profile form</div> }));
vi.mock('@/app/(app)/agency/settings/billing/payment-button', () => ({ PaymentButton: () => null }));
vi.mock('./settings/profile/client-features-form', () => ({ ClientFeaturesForm: () => <div>features form</div> }));
vi.mock('./settings/profile/actions', () => ({ saveFeaturesAction: vi.fn(), updateProfileAction: vi.fn() }));
vi.mock('./settings/alerts/actions', () => ({ saveAlertRulesAction: vi.fn() }));
vi.mock('./settings/delivery/actions', () => ({ addRecipientAction: vi.fn(), deactivateRecipientAction: vi.fn(), saveDeliveryAction: vi.fn() }));
vi.mock('./settings/ai/actions', () => ({ createClientTokenAction: vi.fn(), revokeClientGrantAction: vi.fn(), revokeClientTokenAction: vi.fn() }));
vi.mock('./settings/billing/actions', () => ({ managePaymentAction: Object.assign(async () => ({ ok: true }), { bind: () => async () => ({ ok: true }) }) }));
vi.mock('./settings/runbook/actions', () => ({ clientRunbookAction: Object.assign(vi.fn(), { bind: () => vi.fn() }), clientRunbookStatusAction: Object.assign(vi.fn(), { bind: () => vi.fn() }) }));
vi.mock('./setup/actions', () => ({
  advanceSetupAction: vi.fn(), enableBillingAction: vi.fn(), inviteOwnerAction: vi.fn(), pickSetupCompetitorsAction: vi.fn(), saveSetupProfileAction: vi.fn(), sendReviewAction: vi.fn(), setupStatusAction: vi.fn(),
}));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => `/c/${C}`, notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const PROFILE = {
  id: C, name: 'Lone Star Cooling', status: 'active', timezone: 'America/Chicago', verticalId: 'hvac_plumbing', services: ['ac_repair'], keywords: ['ac repair'], placeId: 'p1',
  serviceArea: { center: { lat: 33, lng: -97 }, radiusKm: 15, zips: [], towns: [] }, features: ['dashboard'], alertMode: 'after_am_check', briefAutoSend: false,
};
const tool = async (_ctx: unknown, name: string, input: Record<string, unknown>) => {
  m.calls.push([name, input]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'get_client_profile': return PROFILE;
    case 'get_client_setup':
      return {
        state: { open: m.setupOpen, exists: true, totalSteps: 5, steps: { profile: 'todo', search: 'todo', competitors: 'todo', invite: 'todo', billing: 'todo' }, dismissedAt: null },
        lookup: null, suggestions: { status: 'none' }, search: null, competitorSuggestions: [],
        invite: { status: 'none', name: null, email: null },
        vertical: { name: 'HVAC & Plumbing', services: [{ id: 'ac_repair', name: 'AC repair' }], seedKeywords: ['ac repair'] },
      };
    case 'get_connect_status': return { status: 'off', chargesEnabled: false, defaultPriceCents: null, defaultSetupFeeCents: null };
    case 'list_client_billing_status': return { clients: [] };
    case 'list_client_recipients': return { items: m.recipients ? [{ contactId: 'k1', email: 'owner@client.com', name: 'Owner', role: 'client_owner', active: true, hasAccount: true }] : [] };
    case 'get_alert_rules': return { alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } };
    case 'list_api_tokens': return { items: m.tokens ? [{ id: 't1', name: 'Laptop', prefix: 'rm_pat_abc', scope: 'read', createdAt: '2026-10-01T00:00:00.000Z', lastUsedAt: null, ownerName: null }] : [] };
    case 'list_oauth_grants': return { items: m.grants ? [{ id: 'g1', appName: 'Claude', scope: 'read', clientName: null, connectedAt: '2026-10-01T00:00:00.000Z', ownerName: null }] : [] };
    case 'get_my_billing':
      return { agencyName: 'Cool Comfort', state: m.billingState, paused: false, enabled: true, nextChargeDate: '2026-12-01T00:00:00.000Z', nextChargeAmountCents: 12900, endsOn: null, canManagePayment: true };
    case 'get_runbook': return { level: 'client', source: 'client', items: [], vars: [], businessAreas: [], tailorStatus: null };
    case 'get_ask_starters': return { questions: [], reviewAllowed: true };
    default: return { items: [] };
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));

const { default: Setup } = await import('./setup/page');
const { default: Profile } = await import('./settings/profile/page');
const { default: Delivery } = await import('./settings/delivery/page');
const { default: Alerts } = await import('./settings/alerts/page');
const { default: Ai } = await import('./settings/ai/page');
const { default: Billing } = await import('./settings/billing/page');
const { default: Runbook } = await import('./settings/runbook/page');

const params = Promise.resolve({ clientId: C });
const bill = { params, searchParams: Promise.resolve({}) };
/** Pages a client owner can reach. */
const CLIENT_PAGES = [
  ['client.setup', () => Setup({ params })],
  ['client.settings.profile', () => Profile({ params })],
  ['client.settings.alerts', () => Alerts({ params })],
  ['client.settings.ai', () => Ai({ params })],
  ['client.settings.billing', () => Billing(bill)],
] as const;
/** Pages an agency role can reach. */
const AGENCY_PAGES = [
  ['client.setup', () => Setup({ params })],
  ['client.settings.profile', () => Profile({ params })],
  ['client.settings.delivery', () => Delivery({ params })],
  ['client.settings.alerts', () => Alerts({ params })],
  ['client.settings.ai', () => Ai({ params })],
  ['client.settings.runbook', () => Runbook({ params })],
] as const;
const page = (key: string) => [...CLIENT_PAGES, ...AGENCY_PAGES].find(([k]) => k === key)![1];

async function show(render_: () => Promise<React.ReactNode>, audience: 'agency' | 'client') {
  m.role = audience === 'agency' ? 'account_manager' : 'client_owner';
  render(<HelpProvider value={{ audience, names: { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' } }}>{await render_()}</HelpProvider>);
}
const tipNames = (names: string[]) => names.map((name) => screen.getByRole('button', { name }));
const hasTip = (name: string) => screen.queryByRole('button', { name }) !== null;
/** The text of the popover the tip opens (not the page behind it, which carries its own field hints). */
const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog').textContent ?? '';
};

beforeEach(() => {
  m.role = 'client_owner'; m.features = ['dashboard', 'alert_rules', 'mcp']; m.guides = []; m.calls = []; m.recipients = true; m.tokens = true; m.grants = true; m.billingState = 'active'; m.setupOpen = true;
});
afterEach(cleanup);

describe('client batch C: guide button', () => {
  const both: [string, 'agency' | 'client'][] = [
    ...CLIENT_PAGES.map(([k]) => [k, 'client'] as [string, 'agency' | 'client']),
    ...AGENCY_PAGES.map(([k]) => [k, 'agency'] as [string, 'agency' | 'client']),
  ];
  for (const [key, audience] of both) {
    it(`${key} (${audience}): shows the Guide button only when list_help_guides has page:${key}, read once for this client`, async () => {
      m.guides = [`page:${key}`];
      await show(page(key), audience);
      expect(await screen.findByRole('button', { name: /guide/i }, { timeout: 15_000 })).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides').map(([, i]) => i)).toEqual([{ context: 'client', clientId: C }]);
      cleanup();
      m.guides = ['page:client.other'];
      await show(page(key), audience);
      expect(screen.queryByRole('button', { name: /guide/i })).toBeNull();
    });
  }

  it('role reach: Delivery and Runbook are agency-only (404 for a client owner), Billing is client-owner-only (404 for agency roles)', async () => {
    m.role = 'client_owner';
    await expect(Delivery({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(Runbook({ params })).rejects.toThrow('NEXT_NOT_FOUND');
    m.role = 'account_manager';
    await expect(Billing(bill)).rejects.toThrow('NEXT_NOT_FOUND');
    m.role = 'agency_admin';
    await expect(Billing(bill)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('client batch C: Setup', () => {
  it('description and the first-brief and service-area tips for both audiences; each audience gets its own steps tip', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.setup'), audience);
      expect(screen.getByText(/Get Lone Star Cooling ready for monitoring/)).toBeTruthy();
      tipNames(['About the setup steps', 'Your first brief', 'Service area']);
      cleanup();
    }
  });

  it('the first-brief tip states the 48-hour wait and the 14-day cap from the code', async () => {
    await show(page('client.setup'), 'client');
    const text = open('Your first brief');
    expect(text).toMatch(/competitors step is done/);
    expect(text).toMatch(/48 hours/);
    expect(text).toMatch(/14 days/);
  });

  it('the steps tip: agency names the invite and billing steps; a client reads three steps and none of that', async () => {
    await show(page('client.setup'), 'agency');
    const a = open('About the setup steps');
    expect(a).toMatch(/Invite the owner/);
    expect(a).toMatch(/Billing/);
    cleanup();
    await show(page('client.setup'), 'client');
    const c = open('About the setup steps');
    expect(c).toMatch(/Your business/);
    expect(c).not.toMatch(/Invite the owner|Billing|dismiss/i);
  });

  it('the service-area tip points at Advanced without repeating the field hints', async () => {
    await show(page('client.setup'), 'client');
    const text = open('Service area');
    expect(text).toMatch(/Advanced/);
    expect(text).not.toMatch(/Identifies the business/);
  });
});

describe('client batch C: Business profile', () => {
  it('client view: description and tips, no agency tip; says to ask the agency, never an account manager', async () => {
    await show(page('client.settings.profile'), 'client');
    expect(screen.getByText(/The services, search keywords and service area used to find and compare Lone Star Cooling's competitors/)).toBeTruthy();
    tipNames(['Services and keywords', 'Service area', 'Google Business Profile', 'Changing these details']);
    expect(hasTip('Client features')).toBe(false);
    expect(document.body.textContent).toContain('contact Cool Comfort');
    expect(document.body.textContent).not.toMatch(/account manager/i);
  });

  it('agency view: the same tips plus Client features, without the client-only change tip', async () => {
    await show(page('client.settings.profile'), 'agency');
    tipNames(['Services and keywords', 'Service area', 'Google Business Profile', 'Client features']);
    expect(hasTip('Changing these details')).toBe(false);
  });

  it('the keyword limit comes from the code', async () => {
    await show(page('client.settings.profile'), 'client');
    expect(open('Services and keywords')).toMatch(/up to 5/);
  });
});

describe('client batch C: Delivery (agency only)', () => {
  it('description and tips; the alert mode tip uses the label "I review alerts first", the 17:00 digest in the business time zone and the 3-a-day limit', async () => {
    await show(page('client.settings.delivery'), 'agency');
    expect(screen.getByText(/How and when Lone Star Cooling receives alerts and briefs/)).toBeTruthy();
    tipNames(['Alert mode', 'Automatic sending', 'What runs on this clock', 'Recipients']);
    const text = open('Alert mode');
    expect(text).toMatch(/I review alerts first/);
    expect(text).toMatch(/17:00/);
    expect(text).toMatch(/3 instant alerts/);
  });

  it('the time zone tip names what runs on the business clock: Monday 07:00 briefs and the 17:00 digest', async () => {
    await show(page('client.settings.delivery'), 'agency');
    const text = open('What runs on this clock');
    expect(text).toMatch(/Monday at 07:00/);
    expect(text).toMatch(/17:00/);
  });

  it('empty recipients state', async () => {
    m.recipients = false;
    await show(page('client.settings.delivery'), 'agency');
    expect(screen.getByRole('heading', { name: 'No recipients yet' })).toBeTruthy();
    expect(screen.getByText(/Nobody receives this client's alerts or briefs/)).toBeTruthy();
  });
});

describe('client batch C: Alert rules', () => {
  it('description and the levels tip for both audiences; the daily limit tip is agency-only', async () => {
    await show(page('client.settings.alerts'), 'client');
    expect(screen.getByText(/The score at which a competitor change becomes an instant alert/)).toBeTruthy();
    tipNames(['Alert and brief levels']);
    expect(hasTip('Instant alerts per day')).toBe(false);
    const text = open('Alert and brief levels');
    expect(text).toMatch(/0 to 100/);
    expect(text).not.toMatch(/3 a day|per day|digest/i);
    cleanup();
    await show(page('client.settings.alerts'), 'agency');
    tipNames(['Alert and brief levels', 'Instant alerts per day']);
    expect(open('Instant alerts per day')).toMatch(/3/);
  });
});

describe('client batch C: Alert rules daily-limit line', () => {
  const LINE = /Instant alerts are still limited to 3 a day/;
  it('is shown to agency roles only', async () => {
    await show(page('client.settings.alerts'), 'client');
    expect(document.body.textContent).not.toMatch(LINE);
    cleanup();
    await show(page('client.settings.alerts'), 'agency');
    expect(document.body.textContent).toMatch(LINE);
  });
});

describe('client batch C: AI connection', () => {
  it('description with the client name; connector, token, permission and connected-app tips for client and agency', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.settings.ai'), audience);
      expect(screen.getByText(/Connect Claude, ChatGPT or another AI assistant to Lone Star Cooling's competitor data/)).toBeTruthy();
      tipNames(['Adding the connector', 'What a token is', 'Permission levels', 'Connected apps']);
      cleanup();
    }
  });

  it('the permission tip lists only what the viewer can choose; the agency-only tip explains where agency tokens live', async () => {
    await show(page('client.settings.ai'), 'client');
    const text = open('Permission levels');
    expect(text).toMatch(/Read only/);
    expect(text).toMatch(/Read and feedback/);
    expect(text).not.toMatch(/manage/i);
    expect(hasTip('Agency tokens')).toBe(false);
    cleanup();
    await show(page('client.settings.ai'), 'agency');
    tipNames(['Agency tokens']);
  });

  it('empty states for tokens and connected apps', async () => {
    m.tokens = false;
    m.grants = false;
    await show(page('client.settings.ai'), 'client');
    expect(screen.getByRole('heading', { name: 'No access tokens yet' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No connected apps yet' })).toBeTruthy();
  });
});

describe('client batch C: Billing (client owner only)', () => {
  it('description names the agency; status, next charge and manage payment tips; never the platform, seats or prices', async () => {
    await show(page('client.settings.billing'), 'client');
    expect(screen.getByText(/The status of your plan, your next charge and your payment method/)).toBeTruthy();
    tipNames(['Billing status', 'Next charge', 'Manage payment details']);
    for (const t of ['Billing status', 'Next charge', 'Manage payment details']) {
      const text = open(t);
      expect(text, t).not.toMatch(/rival\s*monday|\bseats?\b|platform|stripe|\$\d/i);
      fireEvent.click(screen.getByRole('button', { name: t }));
    }
  });

  it('the status tip explains each status the page can show', async () => {
    await show(page('client.settings.billing'), 'client');
    const text = open('Billing status');
    for (const s of ['Active', 'Payment needed', 'Awaiting payment setup', 'Cancelled', 'Paused', 'Not set up']) expect(text, s).toContain(s);
  });
});

describe('client batch C: Runbook (agency only)', () => {
  it('description and the four tips', async () => {
    await show(page('client.settings.runbook'), 'agency');
    expect(screen.getByText(/The plays, starting-point rules and settings used for this client/)).toBeTruthy();
    tipNames(['Plays, rules and settings', 'Inherited and customised', 'Update available', 'This client’s own runbook']);
  });

  it('the update tip covers the three choices: use the update, keep mine, and the tailored version', async () => {
    await show(page('client.settings.runbook'), 'agency');
    const text = open('Update available');
    for (const w of ['Review update', 'Use the update', 'Keep mine', 'Approve', 'Use as is']) expect(text, w).toContain(w);
  });
});

describe('client batch C: no agency-only help reaches a client', () => {
  it('every tip popover on every page a client owner can reach is free of agency-only wording', async () => {
    for (const [key, render_] of CLIENT_PAGES) {
      await show(render_, 'client');
      const seen: string[] = [];
      const tips = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'dialog');
      expect(tips.length, key).toBeGreaterThan(0);
      for (const b of tips) {
        fireEvent.click(b);
        seen.push(screen.getByRole('dialog').textContent ?? '');
        fireEvent.click(b);
      }
      expect(seen.join('\n'), key).not.toMatch(/\brout(e|ed|ing)\b|upsell|\bseats?\b|AM check|account manager|DataForSEO|Stadia|OpenRouter|Jev\b|rival\s*monday|0\.85|threshold|quota|Settings ›|Approvals|ppc_audit|I review alerts first|Digest only/i);
      cleanup();
    }
  });
});

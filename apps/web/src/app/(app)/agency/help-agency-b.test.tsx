// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';
import { PAGE_COPY, type PageCopy } from '@/help/copy';

/**
 * 15b-2 Task 8, agency batch B (the agency settings pages: AI connections, Billing, Branding & voice, Intake link,
 * Platform access, Runbook, Slack & Teams, Team, Usage & limits): the Guide button follows `list_help_guides` for the
 * agency context, descriptions, tips and empty states render with the agency's names, the numbers in the tips are the
 * ones the code uses, and nothing names the platform. Client roles get a 404 on every page; the admin-only pages 404 for
 * an account manager too.
 */
const A = '11111111-1111-4111-8111-111111111111';
const m = vi.hoisted(() => ({
  role: 'agency_admin' as string, guides: [] as string[], calls: [] as [string, unknown][], usage: [] as unknown[], webhooks: [] as unknown[], team: { members: [] as unknown[], invitations: [] as unknown[] },
  tokens: [] as unknown[], grants: [] as unknown[], invoices: [] as unknown[], sessions: [] as unknown[], link: { slug: null, enabled: false, url: null, counts: { newThisMonth: 0, accepted: 0 } } as Record<string, unknown>,
}));

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => {
    const ctx = createAccessContext({ agencyId: A, userId: 'u', role: m.role as never, clientScope: (m.role.startsWith('client') ? ['22222222-2222-4222-8222-222222222222'] : 'all') as never, features: ['dashboard'] as never });
    return { viewer: { kind: 'user', ctx }, ctx };
  },
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Sunny' }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Cool Comfort', primary: '#47A8E7' }, style: {}, assistantName: 'Sunny' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.test' }) }));
vi.mock('@cs/tools', () => ({}));
vi.mock('@/components/spend-badge', () => ({ SpendBadge: () => <span /> }));
vi.mock('@/components/runbook/runbook-editor', () => ({ RunbookEditor: () => <div data-testid="editor" /> }));
vi.mock('@/components/billing/refresh-until-changed', () => ({ RefreshUntilChanged: () => null }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('NEXT_REDIRECT'); },
  usePathname: () => '/agency/settings/team', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/server/run-tool', () => ({ runTool: vi.fn() }));

const SUMMARY = {
  state: 'trialing', plan: { name: 'Standard', version: 1, basePriceCents: 29900, includedSeats: 3, seatPriceCents: 4900 },
  dates: { trialEndsAt: '2026-11-13T12:00:00Z', pilotEndsAt: null, pastDueSince: null, pausesOn: null, cancelAt: null },
  seats: { used: 2, included: 3, extra: 0 }, nextInvoice: null, discount: null, recentInvoices: [] as unknown[], hasSubscription: false,
};
const tool = async (_ctx: unknown, name: string) => {
  m.calls.push([name, null]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'list_api_tokens': return { items: m.tokens };
    case 'list_oauth_grants': return { items: m.grants };
    case 'get_billing_summary': return { ...SUMMARY, recentInvoices: m.invoices };
    case 'get_connect_status': return { status: 'not_connected', defaultPriceCents: null, defaultSetupFeeCents: null, autoPauseAfterDays: null, billingConfigured: true };
    case 'get_intake_link': return m.link;
    case 'list_support_sessions': return { rows: m.sessions, nextCursor: null, notifyEnabled: false };
    case 'get_runbook': return { level: 'agency', items: [], vars: [], businessAreas: [], source: 'agency' };
    case 'get_agency_branding': return { stored: {}, resolved: { displayName: 'Cool Comfort' } };
    case 'list_webhooks': return { items: m.webhooks };
    case 'get_team': return m.team;
    case 'get_usage': return { month: '2026-10', items: m.usage, agencyLevelCredits: null, totalCredits: 400 };
    default: return { items: [] };
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));

const { default: Ai } = await import('./settings/ai/page');
const { default: Billing } = await import('./settings/billing/page');
const { default: Branding } = await import('./settings/branding/page');
const { default: Intake } = await import('./settings/intake/page');
const { default: PlatformAccess } = await import('./settings/platform-access/page');
const { default: Runbook } = await import('./settings/runbook/page');
const { default: SlackTeams } = await import('./settings/slack-teams/page');
const { default: Team } = await import('./settings/team/page');
const { default: Usage } = await import('./settings/usage/page');

const USAGE_ROW = { clientId: 'c1', name: 'Lone Star Cooling', status: 'active', credits: { used: 300, limit: 1500, ratio: 0.2, level: 'ok' }, competitorLimit: 5, competitors: 2, questions: { used: 4, quota: 100 } };
const PAGES = [
  ['agency.settings.ai', () => Ai(), 'agency'],
  ['agency.settings.billing', () => Billing({ searchParams: Promise.resolve({}) }), 'admin'],
  ['agency.settings.branding', () => Branding(), 'admin'],
  ['agency.settings.intake', () => Intake(), 'admin'],
  ['agency.settings.platform-access', () => PlatformAccess({ searchParams: Promise.resolve({}) }), 'admin'],
  ['agency.settings.runbook', () => Runbook(), 'agency'],
  ['agency.settings.slack-teams', () => SlackTeams(), 'admin'],
  ['agency.settings.team', () => Team(), 'agency'],
  ['agency.settings.usage', () => Usage(), 'agency'],
] as const;
const page = (key: string) => PAGES.find(([k]) => k === key)![1];

async function show(key: string) {
  render(<HelpProvider value={{ audience: 'agency', names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>{await page(key)()}</HelpProvider>);
}
/** The header's Guide button (not the "More in the guide" link an empty state carries). */
const isPageGuide = (el: HTMLElement) => !/more in/i.test(el.textContent ?? '');
const guideButton = async () => (await screen.findAllByRole('button', { name: /guide/i }, { timeout: 15_000 })).find(isPageGuide);
const hasTip = (name: string) => screen.queryByRole('button', { name }) !== null;
/** The text of the popover the tip opens. */
const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog').textContent ?? '';
};

beforeEach(() => {
  m.role = 'agency_admin'; m.guides = []; m.calls = []; m.usage = []; m.webhooks = []; m.team = { members: [], invitations: [] }; m.tokens = []; m.grants = []; m.invoices = []; m.sessions = [];
  m.link = { slug: null, enabled: false, url: null, counts: { newThisMonth: 0, accepted: 0 } };
});
afterEach(cleanup);

describe('agency batch B: guide button and reach', () => {
  for (const [key] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read once for the agency context`, async () => {
      m.guides = [`page:${key}`];
      await show(key);
      expect(await guideButton()).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides')).toHaveLength(1);
      cleanup();
      m.guides = ['page:agency.settings.other'];
      await show(key);
      expect(screen.queryAllByRole('button', { name: /guide/i }).filter(isPageGuide)).toHaveLength(0);
    });
  }

  it('a client role gets a 404 on every page', async () => {
    m.role = 'client_owner';
    for (const [key, render_] of PAGES) await expect(render_(), key).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('an account manager gets a 404 on the admin-only pages and reads the rest', async () => {
    m.role = 'account_manager';
    for (const [key, render_, who] of PAGES) {
      if (who === 'admin') await expect(render_(), key).rejects.toThrow('NEXT_NOT_FOUND');
      else await expect(render_(), key).resolves.toBeTruthy();
    }
  });
});

describe('agency batch B: AI connections', () => {
  it('description and the four tips; the levels tip names all three agency levels and the role cap', async () => {
    await show('agency.settings.ai');
    expect(screen.getByText(/to every client you can access/)).toBeTruthy();
    for (const t of ['Adding the connector', 'What a token is', 'Permission levels', 'Connected apps']) expect(hasTip(t), t).toBe(true);
    const l = open('Permission levels');
    for (const w of ['Read only', 'Read and feedback', 'Read, feedback and manage', 'alert levels']) expect(l, w).toContain(w);
  });

  it('with no tokens or apps: two teaching empty states', async () => {
    await show('agency.settings.ai');
    expect(screen.getByText('No access tokens yet')).toBeTruthy();
    expect(screen.getByText('No connected apps yet')).toBeTruthy();
  });
});

describe('agency batch B: Billing', () => {
  it('the plan tip explains that a client is a seat, defers to the card for prices and never hard-codes one', async () => {
    await show('agency.settings.billing');
    const p = open('Your plan and clients');
    for (const w of ['active', 'paused', 'prospect', 'plan card']) expect(p, w).toContain(w);
    expect(p).not.toMatch(/\$\d/);
    expect(screen.getByText(/\$299 per month, includes 3 clients; each extra client \$49 per month/)).toBeTruthy();
  });

  it('the status tip uses the page labels and the 7 day pause', async () => {
    await show('agency.settings.billing');
    const s = open('Billing status');
    for (const w of ['Pilot', 'Free trial', 'Active', 'Payment overdue', 'Read-only', 'Suspended', 'Cancelled', '7 days']) expect(s, w).toContain(w);
    for (const t of ['Next invoice', 'About client billing', 'Discount codes']) expect(hasTip(t), t).toBe(true);
  });

  it('with no invoices: a teaching empty state', async () => {
    await show('agency.settings.billing');
    expect(screen.getByText('No invoices yet')).toBeTruthy();
    expect(screen.getByText(/Invoices appear here after the first payment/)).toBeTruthy();
  });
});

describe('agency batch B: Branding & voice', () => {
  it('the description is neutral; the display tip says what clients see without one; the sender tip names the from-name', async () => {
    await show('agency.settings.branding');
    expect(screen.getByText(/Make the app and your emails look like your agency/)).toBeTruthy();
    for (const t of ['Display name', 'Logo', 'Colours', 'Email sender', 'Naming your assistant']) expect(hasTip(t), t).toBe(true);
    expect(open('Display name')).toMatch(/registered name/);
    cleanup();
    await show('agency.settings.branding');
    expect(open('Email sender')).toMatch(/from-name/);
    cleanup();
    await show('agency.settings.branding');
    expect(open('Naming your assistant')).toMatch(/30 characters/);
  });
});

describe('agency batch B: Intake link', () => {
  it('the name tip says an old link stops working and nothing redirects; the format is 3 to 40 characters', async () => {
    await show('agency.settings.intake');
    const n = open('Link name');
    for (const w of ['3 to 40', 'stops working', 'does not redirect', 'button']) expect(n, w).toContain(w);
    for (const t of ['Your link', 'Switching the link off', 'Lead counts']) expect(hasTip(t), t).toBe(true);
  });
});

describe('agency batch B: Platform access', () => {
  it('the sessions tip states 60 minutes, read-only and the audit record, and never names the platform', async () => {
    await show('agency.settings.platform-access');
    const s = open('What a support session is');
    for (const w of ['60 minutes', 'read-only', 'audit log']) expect(s, w).toContain(w);
    expect(s).not.toMatch(/rival\s*monday/i);
    for (const t of ['Email alerts', 'End reasons']) expect(hasTip(t), t).toBe(true);
  });

  it('with no sessions: a teaching empty state', async () => {
    await show('agency.settings.platform-access');
    expect(screen.getByText('No support sessions')).toBeTruthy();
  });
});

describe('agency batch B: Runbook', () => {
  it('the description names the assistant; the edit tip says only admins edit here; the clients tip names the built-in plays', async () => {
    await show('agency.settings.runbook');
    expect(screen.getByText(/Sunny words its recommendations/)).toBeTruthy();
    expect(open('Who can edit')).toMatch(/Only agency admins/);
    cleanup();
    await show('agency.settings.runbook');
    expect(open('How clients get it')).toMatch(/built-in plays/);
    for (const t of ['Plays, rules and settings', 'Customised and inherited', 'Updates from the standard runbook']) expect(hasTip(t), t).toBe(true);
  });
});

describe('agency batch B: Slack & Teams', () => {
  it('the how-to names the Slack and Teams hosts that are accepted and the notice kinds', async () => {
    m.webhooks = [{ id: 'w1', kind: 'slack', host: 'hooks.slack.com', kinds: null, active: true, createdAt: new Date() }];
    await show('agency.settings.slack-teams');
    const h = open('Getting a webhook URL');
    for (const w of ['hooks.slack.com', 'webhook.office.com', 'logic.azure.com', 'https']) expect(h, w).toContain(w);
    for (const t of ['Which notices', 'Your webhook URL is private', 'Turning one off']) expect(hasTip(t), t).toBe(true);
  });

  it('with no webhooks: a teaching empty state', async () => {
    await show('agency.settings.slack-teams');
    expect(screen.getByText('No webhooks yet')).toBeTruthy();
    expect(screen.getByText(/Add one below/)).toBeTruthy();
  });
});

describe('agency batch B: Team', () => {
  it('the roles tip lists the four roles and the invitation tip states 14 days', async () => {
    await show('agency.settings.team');
    const r = open('Roles');
    for (const w of ['Admin', 'Account manager', 'Client owner', 'Client viewer']) expect(r, w).toContain(w);
    cleanup();
    await show('agency.settings.team');
    expect(open('Invitations')).toMatch(/14 days/);
    for (const t of ['Assigned clients', 'Removing someone']) expect(hasTip(t), t).toBe(true);
  });

  it('with nobody listed: both empty states teach', async () => {
    await show('agency.settings.team');
    expect(screen.getByText('No members yet')).toBeTruthy();
    expect(screen.getByText('No pending invitations')).toBeTruthy();
  });
});

describe('agency batch B: Usage & limits', () => {
  it('the questions tip says only client questions count', async () => {
    m.usage = [USAGE_ROW];
    await show('agency.settings.usage');
    expect(open('Question quota')).toMatch(/client owners and viewers/);
    cleanup();
    await show('agency.settings.usage');
    const n = open('Near cap and over cap');
    expect(n).toMatch(/80%/);
    expect(n).toMatch(/100%/);
  });

  it('the spend tip says what is counted and what is not split by client', async () => {
    m.usage = [USAGE_ROW];
    await show('agency.settings.usage');
    const s = open('What spend includes');
    expect(s).toMatch(/UTC/);
    expect(s).toMatch(/not split/);
  });

  it('with no clients: a teaching empty state', async () => {
    await show('agency.settings.usage');
    expect(screen.getByText('No clients to show yet')).toBeTruthy();
  });
});

describe('agency batch B: nothing names the platform, the assistant or a theme', () => {
  it('no short copy for these pages says Rival Monday, hard-codes Friday, or says theme', () => {
    const texts: string[] = [];
    for (const [key, copy] of Object.entries(PAGE_COPY) as [string, PageCopy][]) {
      if (!key.startsWith('agency.settings.')) continue;
      texts.push(copy.description);
      for (const t of Object.values(copy.tips ?? {})) texts.push(t.title, t.body);
      for (const e of Object.values(copy.empty ?? {})) texts.push(e.title, e.body);
    }
    expect(texts.length).toBeGreaterThan(60);
    for (const t of texts) expect(t).not.toMatch(/rival\s*monday|\bfriday\b|\bthemes?\b/i);
  });
});

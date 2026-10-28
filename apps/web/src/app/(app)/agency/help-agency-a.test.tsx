// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';
import { PAGE_COPY, type PageCopy } from '@/help/copy';

/**
 * 15b-2 Task 7, agency batch A (Portfolio, Add a client, Approvals, a brief's review, Alert review, Prospects, Add a
 * prospect, a prospect, Leads): the Guide button follows `list_help_guides` for the agency context, descriptions, tips and
 * empty states render with the agency's names, the numbers in the tips are the ones the code uses, and nothing names the
 * platform. Client roles get a 404 on every page; the pages that need access to all clients 404 for a scoped account manager.
 */
const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const m = vi.hoisted(() => ({
  role: 'agency_admin' as string, scope: 'all' as 'all' | string[], guides: [] as string[], calls: [] as [string, unknown][],
  portfolio: [] as unknown[], queue: [] as unknown[], alerts: [] as unknown[], prospects: [] as unknown[], leads: { verified: [], accepted: [], declined: [] } as Record<string, unknown[]>,
  checklist: true,
}));

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ ctx: createAccessContext({ agencyId: A, userId: 'u', role: m.role as never, clientScope: m.scope as never, features: ['dashboard'] as never }) }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Sunny' }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC & plumbing', services: [] }] }));
vi.mock('@/server/timezones', () => ({ timezoneOptions: () => ['America/Chicago'] }));
vi.mock('@/components/spend-badge', () => ({ SpendBadge: () => <span /> }));
vi.mock('@/components/billing/client-billing-controls', () => ({ ClientBillingControls: () => null }));
vi.mock('@/components/prospect-landscape', () => ({ ProspectLandscape: () => null }));
vi.mock('@/components/evidence-chips', () => ({ EvidenceChips: () => null }));
vi.mock('@/components/views/scorecard', () => ({ Scorecard: () => null }));
vi.mock('@/app/(onboarding)/onboarding/actions', () => ({ dismissChecklistAction: async () => {} }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('@/app/(onboarding)/agency/clients/new/vertical-actions', () => ({ createVerticalAction: vi.fn(), draftVerticalAction: vi.fn() }));
vi.mock('./prospects/[clientId]/actions', () => ({ convertAction: vi.fn(), runSnapshotAction: vi.fn() }));
vi.mock('./approvals/[briefId]/actions', () => ({ approveAction: vi.fn(), autoSendAction: vi.fn(), dropItemAction: vi.fn(), editItemAction: vi.fn(), moveItemAction: vi.fn(), rateItemAction: vi.fn(), sendNowAction: vi.fn() }));
vi.mock('./alerts/actions', () => ({ approveAlertAction: vi.fn(), dismissAlertAction: vi.fn() }));
vi.mock('./leads/actions', () => ({ acceptLeadAction: vi.fn(), declineLeadAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('NEXT_REDIRECT'); },
  usePathname: () => '/agency', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const BRIEF = {
  id: 'b1', clientId: C, clientName: 'Lone Star Cooling', kind: 'weekly', deliveryDate: '2026-10-26', status: 'ready', summary: 'A quiet-ish week.', items: [], scorecard: null,
  autoSend: false, clientTimezone: 'America/Chicago', touched: false, factCheck: { sentences: 0, items: 0 },
};
const PROFILE = { id: C, name: 'Lone Star Cooling', status: 'prospect', keywords: [], serviceArea: null };
const tool = async (_ctx: unknown, name: string, input: Record<string, unknown>) => {
  m.calls.push([name, input]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'get_portfolio': return { items: m.portfolio };
    case 'list_client_billing_status': return { clients: [] };
    case 'get_onboarding_status': return { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: !m.checklist, completed: false };
    case 'get_billing_summary': return { state: 'trialing' };
    case 'list_brief_queue': return { items: m.queue };
    case 'get_brief_review': return BRIEF;
    case 'list_alert_queue': return { items: m.alerts, capped: false, clients: [] };
    case 'list_prospects': return { items: m.prospects };
    case 'get_client_profile': return PROFILE;
    case 'list_client_competitors': return { items: [], limit: 5 };
    case 'get_prospect_report': return { report: null };
    case 'list_leads': return { leads: m.leads[String(input.status)] ?? [] };
    default: return { items: [] };
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));

const { default: Portfolio } = await import('./page');
const { default: Approvals } = await import('./approvals/page');
const { default: ApprovalReview } = await import('./approvals/[briefId]/page');
const { default: Alerts } = await import('./alerts/page');
const { default: Prospects } = await import('./prospects/page');
const { default: Prospect } = await import('./prospects/[clientId]/page');
const { default: Leads } = await import('./leads/page');

const ROW = {
  clientId: C, name: 'Lone Star Cooling', verticalId: 'hvac_plumbing', pressure: { score: 12, level: 'low', reasons: ['Quiet'] }, topCompetitor: null,
  credits: { used: 100, limit: 2000, ratio: 0.05, level: 'ok' }, alertsPending: 0, alertsDelivered7d: 0, briefToApprove: null, openRecommendations: 0, lastActivityAt: null, setup: null,
};
const PAGES = [
  ['agency.portfolio', () => Portfolio()],
  ['agency.approvals', () => Approvals()],
  ['agency.approvals.detail', () => ApprovalReview({ params: Promise.resolve({ briefId: 'b1' }) })],
  ['agency.alerts', () => Alerts({ searchParams: Promise.resolve({}) })],
  ['agency.prospects', () => Prospects()],
  ['agency.prospects.detail', () => Prospect({ params: Promise.resolve({ clientId: C }) })],
  ['agency.leads', () => Leads({ searchParams: Promise.resolve({}) })],
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
  m.role = 'agency_admin'; m.scope = 'all'; m.guides = []; m.calls = []; m.portfolio = []; m.queue = []; m.alerts = []; m.prospects = []; m.leads = { verified: [], accepted: [], declined: [] }; m.checklist = true;
});
afterEach(cleanup);

describe('agency batch A: guide button and reach', () => {
  for (const [key] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read once for the agency context`, async () => {
      m.guides = [`page:${key}`];
      await show(key);
      expect(await guideButton()).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides').map(([, i]) => i)).toEqual([{ context: 'agency' }]);
      cleanup();
      m.guides = ['page:agency.other'];
      await show(key);
      expect(screen.queryAllByRole('button', { name: /guide/i }).filter(isPageGuide)).toHaveLength(0);
    });
  }

  it('a client role gets a 404 on every page', async () => {
    m.role = 'client_owner'; m.scope = [C];
    for (const [key, render_] of PAGES) await expect(render_(), key).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('an account manager scoped to some clients gets a 404 on Leads, and still reads the rest', async () => {
    m.role = 'account_manager'; m.scope = [C];
    for (const key of ['agency.leads']) await expect(page(key)(), key).rejects.toThrow('NEXT_NOT_FOUND');
    for (const key of ['agency.portfolio', 'agency.approvals', 'agency.alerts', 'agency.prospects']) await expect(page(key)(), key).resolves.toBeTruthy();
  });
});

describe('agency batch A: Portfolio', () => {
  it('description (sort order) and the six tips, the checklist tip only while the card shows', async () => {
    m.portfolio = [ROW];
    await show('agency.portfolio');
    expect(screen.getByText(/Clients with an alert to check or a brief to approve come first, then the highest pressure/)).toBeTruthy();
    for (const t of ['Competitive pressure', 'Budget', 'Alerts and briefs', 'Open actions', 'The setup chip', 'The checklist']) expect(hasTip(t), t).toBe(true);
    cleanup();
    m.checklist = false;
    await show('agency.portfolio');
    expect(hasTip('The checklist')).toBe(false);
  });

  it('the pressure tip uses the badge words and the 30-day window; the budget tip states 80% and 100%', async () => {
    m.portfolio = [ROW];
    await show('agency.portfolio');
    const p = open('Competitive pressure');
    for (const w of ['High pressure (70 and above)', 'Medium pressure (40 to 69)', 'Low pressure (1 to 39)', 'Quiet (0)', 'last 30 days']) expect(p, w).toContain(w);
    expect(p).not.toMatch(/elevated/i);
    cleanup();
    await show('agency.portfolio');
    const b = open('Budget');
    expect(b).toMatch(/80%/);
    expect(b).toMatch(/100%/);
  });

  it('with no clients: a teaching empty state with the Add client link for an admin, a different one for a scoped account manager', async () => {
    await show('agency.portfolio');
    expect(screen.getByText('No clients yet')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Add client' }).length).toBeGreaterThan(0);
    cleanup();
    m.role = 'account_manager'; m.scope = [C];
    await show('agency.portfolio');
    expect(screen.getByText(/Ask an agency admin to add a client/)).toBeTruthy();
  });
});

describe('agency batch A: Approvals and the brief review', () => {
  it('Approvals: the description names the assistant, Thursday night and Monday 07:00; with no briefs a teaching empty state', async () => {
    await show('agency.approvals');
    expect(screen.getByText(/Sunny drafts each client's brief on Thursday night/)).toBeTruthy();
    expect(screen.getByText(/Monday 07:00/, { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('No briefs this week')).toBeTruthy();
  });

  it('Approvals: the status and items tips appear once there is a brief; the status tip uses the page labels', async () => {
    m.queue = [{ briefId: 'b1', clientName: 'Lone Star Cooling', deliveryDate: '2026-10-26', status: 'ready', kind: 'weekly', activeItems: 3, droppedItems: 1, touched: false, autoSend: false }];
    await show('agency.approvals');
    const s = open('Status');
    for (const w of ['Ready for review', 'Approved', 'Sent', 'Drafting', 'Failed — retrying']) expect(s, w).toContain(w);
    expect(hasTip('Items and badges')).toBe(true);
  });

  it('Brief review: the confidence tip states one band at 85%, never medium or low', async () => {
    await show('agency.approvals.detail');
    const c = open('Confidence');
    expect(c).toMatch(/85%/);
    expect(c).toMatch(/High confidence/);
    expect(c).not.toMatch(/medium|low confidence/i);
    for (const t of ['Fact-check', 'Upsell tag', 'What approving does', 'Rating items']) expect(hasTip(t), t).toBe(true);
    expect(screen.getByText(/The client sees only the items that remain/)).toBeTruthy();
  });
});

describe('agency batch A: Alert review', () => {
  it('description states the 7-day expiry; the tips cite the 70 default, the 3 instant alerts and the 17:00 digest', async () => {
    await show('agency.alerts');
    expect(screen.getByText(/Unreviewed alerts expire after 7 days/)).toBeTruthy();
    expect(open('Score')).toMatch(/70/);
    cleanup();
    await show('agency.alerts');
    const d = open('Held for the digest');
    expect(d).toMatch(/3 instant alerts/);
    expect(d).toMatch(/17:00/);
  });

  it('with nothing waiting: the teaching empty state keeps the title the e2e reads', async () => {
    await show('agency.alerts');
    expect(screen.getByText('No alerts waiting — nice.')).toBeTruthy();
    expect(screen.getByText(/Alerts appear here for clients set to "I review alerts first"/)).toBeTruthy();
  });
});

describe('agency batch A: Prospects and a prospect', () => {
  it('Prospects: with none, the empty state and New prospect link for an admin; the column tips appear with rows', async () => {
    await show('agency.prospects');
    expect(screen.getByText('No prospects yet')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'New prospect' }).length).toBeGreaterThan(0);
    cleanup();
    m.prospects = [{ clientId: C, name: 'Lone Star Cooling', competitors: 2, keywords: 1, hasServiceArea: true, report: null, createdAt: '2026-10-01T00:00:00.000Z' }];
    await show('agency.prospects');
    expect(open('Ready to snapshot')).toMatch(/at least one keyword, a service area and at least one competitor/);
    expect(hasTip('Snapshot status')).toBe(true);
  });

  it('A prospect: the snapshot tip says what is in it, and the convert tip names the plan limit and the billing step', async () => {
    await show('agency.prospects.detail');
    expect(open('What the snapshot shows')).toMatch(/3 by 3 grid/);
    cleanup();
    await show('agency.prospects.detail');
    const c = open('What converting does');
    expect(c).toMatch(/client limit/);
    expect(c).toMatch(/billing/);
  });
});

describe('agency batch A: Leads', () => {
  it('each tab has its own empty state; the new-leads one points at the intake link', async () => {
    await show('agency.leads');
    expect(screen.getByText('No new leads')).toBeTruthy();
    expect(screen.getByText(/Share your intake link/)).toBeTruthy();
    cleanup();
    m.leads.accepted = [];
    const tab = (k: string) => Leads({ searchParams: Promise.resolve({ tab: k }) });
    render(<HelpProvider value={{ audience: 'agency', names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>{await tab('accepted')}</HelpProvider>);
    expect(screen.getByText('No accepted leads yet')).toBeTruthy();
  });

  it('the status tabs are links, the current one marked aria-current="page"', async () => {
    await show('agency.leads');
    const nav = screen.getByRole('navigation', { name: 'Lead status' });
    const links = nav.querySelectorAll('a[href]');
    expect(links.length).toBeGreaterThan(1);
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(links[0]!.getAttribute('aria-current')).toBe('page');
    expect(links[0]!.getAttribute('href')).toBe('/agency/leads');
  });

  it('the tips name the Accept and invite flow, the lead pool and both sources, with the card labels', async () => {
    await show('agency.leads');
    expect(open('Where leads come from')).toMatch(/From your website.*From the platform/s);
    cleanup();
    await show('agency.leads');
    const d = open('Accepting or declining');
    for (const w of ['Accept and invite', 'prospect', 'client owner', 'pool', 'Let them know']) expect(d, w).toContain(w);
  });
});

describe('agency batch A: nothing names the platform, the assistant or a theme', () => {
  it('no short copy for these pages says Rival Monday, hard-codes Friday, or says theme', () => {
    const texts: string[] = [];
    for (const [key, copy] of Object.entries(PAGE_COPY) as [string, PageCopy][]) {
      if (!key.startsWith('agency.')) continue;
      texts.push(copy.description);
      for (const t of Object.values(copy.tips ?? {})) texts.push(t.title, t.body);
      for (const e of Object.values(copy.empty ?? {})) texts.push(e.title, e.body);
    }
    expect(texts.length).toBeGreaterThan(40);
    for (const t of texts) expect(t).not.toMatch(/rival\s*monday|\bfriday\b|\bthemes?\b/i);
  });
});

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';
import { PAGE_COPY, type PageCopy } from '@/help/copy';

/**
 * 15b-2 Task 9a, platform pages: the Guide button follows `list_help_guides` for the platform context, every page shows
 * its description, its `?` tips and its teaching empty states for an operator (and the operator-only tips for no one
 * else), and the numbers in the tips are the ones the code uses. Pages are operator-only (a refusal is a 404 elsewhere).
 */
const AG = '22222222-2222-4222-8222-222222222222';
const KB = '44444444-4444-4444-8444-444444444444';
const m = vi.hoisted(() => ({
  guides: [] as string[], calls: [] as [string, unknown][], role: 'owner' as string | null, answers: {} as Record<string, unknown>,
  kbImport: false,
}));

const tool = async (_ctx: unknown, name: string, input?: unknown) => {
  m.calls.push([name, input]);
  if (name === 'list_help_guides') return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
  if (!(name in m.answers)) throw new Error(`unmocked tool ${name}`);
  return m.answers[name];
};
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({
  callTool: tool, tryCallTool: tool, toolDeps: () => ({}), isHiddenToolError: () => false,
}));
vi.mock('@cs/tools', () => ({
  platformRole: async () => m.role,
  sourceLabel: (s: string) => s,
  changeTypeOptions: () => [],
  isPlatformOperator: async () => true,
  listReviewableAskThreads: async () => m.answers.ask_list,
  getReviewableAskThread: async () => m.answers.ask_thread,
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async (_db: unknown, agencyId: string) => (agencyId === 'ag1' ? 'Sunny' : 'Friday') }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [] }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ get kbImport() { return m.kbImport; }, webMonitoring: false, appUrl: 'http://localhost' }) }));
vi.mock('@/server/run-tool', () => ({ runTool: vi.fn() }));
vi.mock('@/server/invite-email', () => ({ sendAgencyInviteEmail: vi.fn() }));
vi.mock('@/server/queue', () => ({ enqueueFor: () => undefined, jobStatusFor: () => undefined }));
vi.mock('@/server/store', () => ({ webStore: () => ({ get: async () => null }) }));
vi.mock('@/components/runbook/runbook-editor', () => ({ RunbookEditor: () => <div data-testid="editor" /> }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('NEXT_REDIRECT'); },
  usePathname: () => '/platform', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: Overview } = await import('./page');
const { default: Agencies } = await import('./agencies/page');
const { default: AgencyDetail } = await import('./agencies/[id]/page');
const { default: Billing } = await import('./billing/page');
const { default: Leads } = await import('./leads/page');
const { default: Reviews } = await import('./reviews/page');
const { default: Topics } = await import('./topics/page');
const { default: Ask } = await import('./ask/page');
const { default: AskThread } = await import('./ask/[threadId]/page');
const { default: Knowledge } = await import('./knowledge/page');
const { default: KnowledgeNew } = await import('./knowledge/new/page');
const { default: KnowledgeDetail } = await import('./knowledge/[id]/page');
const { default: Health } = await import('./health/page');
const { default: Costs } = await import('./costs/page');
const { default: Verticals } = await import('./verticals/page');
const { default: Runbook } = await import('./runbook/page');

const tile = { value: 3, delta28d: 1 };
const tiles = { agencies: tile, clientsActive: tile, seats: tile, wau: tile, spendMonthUsd: tile };
const connect = { globalFeePercent: 0, agencies: [], totals: { connectedAgencies: 0, payingClients: 0, clientMrrCents: 0 } };
const funnel = { signups: 0, profileDone: 0, firstClient: 0, cardAdded: 0 };
const costs = {
  services: [], items: [], months: [{ month: '2026-10', apiUsd: 1, manualUsd: 2 }], summary: { mtdUsd: 3, projectedMonthUsd: 9.5, lowCount: 0 },
  refreshQueued: false, aiByVertical: [],
};
const article = (o: object = {}) => ({
  id: KB, title: 'An article', level: 'platform', agencyId: null, clientId: null, kind: 'help', bodyMd: 'x', previousBodyMd: null, status: 'published',
  clientVisible: false, source: 'manual', sourceUrl: null, autoSync: false, syncError: null, ...o,
});
const EMPTY_ANSWERS = (): Record<string, unknown> => ({
  platform_overview: { tiles, series: [] },
  list_platform_activity: { items: [], nextCursor: null },
  list_platform_agencies: { rows: [], nextCursor: null, prevCursor: null },
  get_platform_agency: { agency: { id: AG, name: 'Acme', createdAt: '2025-01-01T12:00:00Z', health: 'steady' }, tiles, series: [], hold: null, archivedAt: null, holdBillingIssue: null, archiveBlockers: { agencyPlan: false, clientSubscriptions: 0 }, clients: [] },
  list_agency_people: { members: [], invitations: [] },
  list_agency_support_sessions: { rows: [] },
  get_agency_billing: { agencyId: AG, state: 'trialing', plan: null, trialEndsAt: null, pilotEndsAt: null, pastDueSince: null, cancelAt: null, seatsSynced: null, seatSyncPending: false, seatCapExempt: false, attachedCouponId: null, invoices: [], events: [] },
  list_discount_codes: { codes: [] },
  get_billing_overview: { mrrCents: 125000, paidSeats: 17, agenciesByState: { pilot: 2, trialing: 1, active: 3, past_due: 0, read_only: 0, suspended: 0, cancelled: 1 } },
  list_plans: { plans: [] },
  list_invite_links: { links: [] },
  get_signups_paused: { paused: false },
  get_signup_funnel: { open: funnel, invite: funnel },
  get_connect_overview: connect,
  list_pool_leads: { leads: [], agencies: [], recentAssignments: [], nextCursor: null, prevCursor: null, total: 0 },
  list_decision_reviews: { items: [], nextCursor: null, prevCursor: null, total: 0 },
  list_topic_proposals: { pending: [], decided: [] },
  ask_list: { items: [], nextCursor: null },
  ask_thread: { id: 't1', title: 'A thread', agencyId: 'ag1', agencyName: 'Acme', clientName: 'Lone Star', createdAt: new Date('2026-10-01T00:00:00Z'), messages: [{ id: 'm1', role: 'assistant', content: 'Hello', citations: [`kb:${KB}`], status: 'ok', action: null, trace: { a: 1 }, createdAt: new Date('2026-10-01T00:00:00Z') }] },
  list_kb_articles: { items: [], nextCursor: null },
  list_kb_targets: { agencies: [] },
  get_kb_article_admin: article(),
  list_platform_costs: costs,
  get_spend_guard: {
    settings: { creditsPerUsd: 100, clientMonthlyLimitUsd: 15, clientPausePercent: 130, spikeWarnPercent: 100, spikePausePercent: 200, spikeFloorUsdPerDay: 5, spikeFloorUsdPerClientDay: 0.5, spikeSnoozeHours: 24 },
    state: { state: 'ok' }, scopes: [], pausedClients: [], events: [],
  },
  get_client_limits: { defaultLimitUsd: 15, pausePercent: 130, items: [] },
  list_catalog_review: { verticals: [], areas: [], count: 0 },
  list_verticals: { verticals: [] },
  get_runbook: { level: 'platform', items: [], vars: [], businessAreas: [], source: 'platform' },
  get_platform_health: {
    generatedAt: '2026-10-01T00:00:00Z', worker: { lastHeartbeatAt: null, status: 'down' }, queues: [], vendors: [],
    sources: [{ kind: 'vendor_call', lastOkAt: null, status: 'down' }, { kind: 'capture', lastOkAt: null, status: 'down' }], sentryUrl: null, queueError: false,
  },
});

/** [key, page, tips this render cannot show (they sit behind a condition tested separately)]. */
const PAGES: [string, () => Promise<React.ReactNode>, string[]][] = [
  ['platform.overview', () => Overview({ searchParams: Promise.resolve({}) }), []],
  ['platform.agencies', () => Agencies({ searchParams: Promise.resolve({}) }), []],
  ['platform.agencies.detail', () => AgencyDetail({ params: Promise.resolve({ id: AG }), searchParams: Promise.resolve({}) }), []],
  ['platform.billing', () => Billing({ searchParams: Promise.resolve({}) }), ['plans', 'codes', 'restrict', 'signup', 'links', 'connect']],
  ['platform.leads', () => Leads({ searchParams: Promise.resolve({}) }), []],
  ['platform.reviews', () => Reviews({ searchParams: Promise.resolve({}) }), []],
  ['platform.topics', () => Topics(), []],
  ['platform.ask', () => Ask({ searchParams: Promise.resolve({}) }), []],
  ['platform.ask.thread', () => AskThread({ params: Promise.resolve({ threadId: 't1' }) }), []],
  ['platform.knowledge', () => Knowledge({ searchParams: Promise.resolve({}) }), []],
  ['platform.knowledge.new', () => KnowledgeNew(), []],
  ['platform.knowledge.detail', () => KnowledgeDetail({ params: Promise.resolve({ id: KB }), searchParams: Promise.resolve({}) }), ['managed', 'autosync']],
  ['platform.health', () => Health(), []],
  ['platform.costs', () => Costs(), []],
  ['platform.verticals', () => Verticals(), []],
  ['platform.runbook', () => Runbook(), []],
];
const page = (key: string) => PAGES.find(([k]) => k === key)![1];
/** Billing & plans shows one tab at a time; the tips that sit on another tab are checked on that tab. */
const BILLING_TAB: Record<string, string> = { plans: 'plans', codes: 'codes', restrict: 'codes', signup: 'signups', links: 'signups', connect: 'connect' };
const copyOf = (key: string) => (PAGE_COPY as Record<string, PageCopy>)[key]!;

async function show(key: string, audience: 'operator' | 'agency' | 'client' = 'operator') {
  render(<HelpProvider value={{ audience, names: { agency: 'your agency', assistant: 'Sunny' } }}>{await page(key)()}</HelpProvider>);
}
const isPageGuide = (el: HTMLElement) => !/more in/i.test(el.textContent ?? '');
const guideButton = async () => (await screen.findAllByRole('button', { name: /guide/i }, { timeout: 15_000 })).find(isPageGuide);
const hasTip = (name: string) => screen.queryByRole('button', { name }) !== null;
/** The text of the popover the tip opens. */
const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog').textContent ?? '';
};
/** Opens a tip of one page by its id and returns its text. */
const tipText = async (key: string, id: string, audience: 'operator' | 'agency' = 'operator') => {
  cleanup();
  if (key === 'platform.billing' && BILLING_TAB[id]) {
    render(<HelpProvider value={{ audience, names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Billing({ searchParams: Promise.resolve({ tab: BILLING_TAB[id] }) })}</HelpProvider>);
  } else {
    await show(key, audience);
  }
  return open(copyOf(key).tips![id]!.title);
};

beforeEach(() => {
  m.guides = []; m.calls = []; m.role = 'owner'; m.kbImport = false; m.answers = EMPTY_ANSWERS();
});
afterEach(cleanup);

describe('platform short copy exists for every page', () => {
  it('has an entry, a description and at least one tip for each of the 16 pages', () => {
    for (const [key] of PAGES) {
      const c = PAGE_COPY[key as keyof typeof PAGE_COPY] as PageCopy | undefined;
      expect(c, key).toBeTruthy();
      expect(c!.description.length, key).toBeGreaterThan(20);
      expect(Object.keys(c!.tips ?? {}).length, key).toBeGreaterThan(0);
    }
  });

  it('never names the product, hard-codes the assistant or says "theme" in a tip, empty state or description', () => {
    const texts: string[] = [];
    for (const [key, c] of Object.entries(PAGE_COPY) as [string, PageCopy][]) {
      if (!key.startsWith('platform.')) continue;
      texts.push(c.description);
      for (const t of Object.values(c.tips ?? {})) texts.push(t.title, t.body);
      for (const e of Object.values(c.empty ?? {})) texts.push(e.title, e.body);
    }
    expect(texts.length).toBeGreaterThan(60);
    for (const t of texts) expect(t).not.toMatch(/rival\s*monday|\bfriday\b|\bthemes?\b/i);
  });

  it('marks every tip and empty state with an audience an operator can read', () => {
    for (const [key, c] of Object.entries(PAGE_COPY) as [string, PageCopy][]) {
      if (!key.startsWith('platform.')) continue;
      for (const [id, t] of Object.entries(c.tips ?? {})) expect(['all', 'operator', undefined], `${key}.${id}`).toContain(t.audience);
      for (const [id, e] of Object.entries(c.empty ?? {})) expect(['all', 'operator', undefined], `${key}.${id}`).toContain(e.audience);
    }
  });
});

describe('platform pages: guide button and description', () => {
  for (const [key] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read once for the platform context`, async () => {
      m.guides = [`page:${key}`];
      await show(key);
      expect(await guideButton()).toBeTruthy();
      const reads = m.calls.filter(([n]) => n === 'list_help_guides');
      expect(reads).toHaveLength(1);
      expect(reads[0]![1]).toEqual({ context: 'platform' });
      cleanup();
      m.guides = ['page:platform.other'];
      await show(key);
      expect(screen.queryAllByRole('button', { name: /guide/i }).filter(isPageGuide)).toHaveLength(0);
    });

    it(`${key}: renders its description from the short copy`, async () => {
      await show(key);
      expect(document.body.textContent).toContain(copyOf(key).description);
    });

    it(`${key}: renders each of its tips for an operator`, async () => {
      await show(key);
      const skip = PAGES.find(([k]) => k === key)![2];
      for (const [id, t] of Object.entries(copyOf(key).tips ?? {})) {
        if (skip.includes(id)) continue;
        expect(hasTip(t.title), `${key}.${id}: ${t.title}`).toBe(true);
      }
    });
  }

  it('an operator-only tip does not render for an agency or client viewer', async () => {
    for (const viewer of ['agency', 'client'] as const) {
      for (const [key] of PAGES) {
        cleanup();
        await show(key, viewer);
        for (const [id, t] of Object.entries(copyOf(key).tips ?? {})) {
          if (t.audience === 'operator') expect(hasTip(t.title), `${viewer} ${key}.${id}`).toBe(false);
        }
      }
    }
  });
});

describe('Overview', () => {
  it('"Last 28 days" says the pill is the change since 28 days ago and how Spend this month compares', async () => {
    const t = await tipText('platform.overview', 'last28');
    for (const w of ['28 days ago', 'live figure', 'month so far']) expect(t, w).toContain(w);
  });

  it('the figures tip names all five and the 7 day window', async () => {
    const t = await tipText('platform.overview', 'figures');
    for (const w of ['Agencies', 'Active clients', 'Seats', 'Weekly active users', 'Spend this month', '7 days', 'UTC']) expect(t, w).toContain(w);
  });

  it('the range and activity tips state 12 weeks, 12 months, Monday and the page size of 20', async () => {
    const r = await tipText('platform.overview', 'range');
    for (const w of ['12 weeks', '12 months', 'Monday']) expect(r, w).toContain(w);
    expect(await tipText('platform.overview', 'activity')).toContain('20');
  });

  it('with no activity: a teaching empty state', async () => {
    await show('platform.overview');
    expect(screen.getByText('No activity yet')).toBeTruthy();
    expect(screen.getByText(/Events appear here as agencies sign up/)).toBeTruthy();
  });
});

describe('Agencies', () => {
  it('the Health tip gives all four flags and the 14 and 28 day rules', async () => {
    const t = await tipText('platform.agencies', 'health');
    for (const w of ['At risk', 'Idle', 'Growing', 'Steady', '28 days', '14 days']) expect(t, w).toContain(w);
  });

  it('the columns tip says how active, WAU, spend and sorting work; the billing tip gives the 7 day pause', async () => {
    const c = await tipText('platform.agencies', 'columns');
    for (const w of ['Active clients', 'WAU', 'Last activity', 'Spend this month', 'Health']) expect(c, w).toContain(w);
    const b = await tipText('platform.agencies', 'billing');
    for (const w of ['Pilot', 'Free trial', 'Active', 'Payment overdue', 'Read-only', 'Suspended', 'Cancelled', '7 days']) expect(b, w).toContain(w);
  });

  it('with no agencies: a teaching empty state', async () => {
    await show('platform.agencies');
    expect(screen.getByText('No agencies yet')).toBeTruthy();
    expect(screen.getByText(/Agencies appear here when they sign up/)).toBeTruthy();
  });
});

describe('Agency detail', () => {
  it('the support tip states 60 minutes, read-only, the 5 to 300 character reason and the audit trail', async () => {
    const t = await tipText('platform.agencies.detail', 'support');
    for (const w of ['60 minutes', 'read-only', '5 to 300', 'audit log']) expect(t, w).toContain(w);
  });

  it('keeps the page-specific line "Created <date>" and the shared health tip', async () => {
    await show('platform.agencies.detail');
    expect(document.body.textContent).toContain('Created Jan 1, 2025');
    expect(hasTip('Health')).toBe(true);
  });

  it('the client limits tip says a blank override uses the default and who edits', async () => {
    const t = await tipText('platform.agencies.detail', 'clientLimits');
    for (const w of ['blank', 'default', 'lifts a spend pause', 'viewers read only']) expect(t, w).toContain(w);
  });

  it('with no clients: a teaching empty state', async () => {
    await show('platform.agencies.detail');
    expect(screen.getByText('No clients yet')).toBeTruthy();
  });
});

describe('Billing & plans', () => {
  it('the restriction tip explains UUID entry: agency ids, separators, 100 at most, where to find one', async () => {
    const t = await tipText('platform.billing', 'restrict');
    for (const w of ['agency ids', 'UUID', 'commas or spaces', '100', '/platform/agencies/', 'invite link']) expect(t, w).toContain(w);
  });

  it('the invite link tip states 1 to 1,000 uses, 1 to 90 days, 14 days by default and that the link is shown once', async () => {
    const t = await tipText('platform.billing', 'links');
    for (const w of ['1,000', '1 to 90', '14', 'once']) expect(t, w).toContain(w);
  });

  it('the plans, sign-up and Connect tips say what they change', async () => {
    expect(await tipText('platform.billing', 'plans')).toMatch(/existing subscriptions keep their prices/i);
    expect(await tipText('platform.billing', 'signup')).toMatch(/invite links keep working/i);
    expect(await tipText('platform.billing', 'connect')).toMatch(/Checkout links created afterwards/);
  });

  it('shows the shared billing states tip', async () => {
    await show('platform.billing');
    expect(hasTip('Billing states')).toBe(true);
  });

  it('a viewer sees the same tips (they read, they do not edit)', async () => {
    m.role = 'viewer';
    render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Billing({ searchParams: Promise.resolve({ tab: 'plans' }) })}</HelpProvider>);
    expect(hasTip(copyOf('platform.billing').tips!.plans!.title)).toBe(true);
  });
});

describe('Lead pool', () => {
  it('the giving tip names who can give a lead and the email; the pool tip says 25 at a time', async () => {
    const g = await tipText('platform.leads', 'giving');
    for (const w of ['owners and staff', 'emailed']) expect(g, w).toContain(w);
    expect(await tipText('platform.leads', 'pool')).toContain('25 at a time');
  });

  it('with an empty pool and no assignments: both teach', async () => {
    await show('platform.leads');
    expect(screen.getByText('The pool is empty')).toBeTruthy();
    expect(screen.getByText('Nothing assigned yet')).toBeTruthy();
  });
});

describe('Model reviews', () => {
  it('the why tip gives the Jev to language model to person cascade and 0.85 (also the verifier threshold)', async () => {
    const t = await tipText('platform.reviews', 'why');
    for (const w of ['Jev', 'language model', 'person', '0.85', 'verifier']) expect(t, w).toContain(w);
  });

  it('the answer tip says the answer fixes the event and becomes a gold label', async () => {
    const t = await tipText('platform.reviews', 'answer');
    expect(t).toMatch(/gold label/);
    expect(t).toMatch(/Model said/);
  });

  it('with an empty queue: a teaching empty state', async () => {
    await show('platform.reviews');
    expect(screen.getByText('Nothing waiting for review')).toBeTruthy();
  });
});

describe('Topic proposals', () => {
  it('uses "topic" everywhere: the page title, tips and description', async () => {
    await show('platform.topics');
    expect(screen.getByRole('heading', { name: 'Topic proposals', level: 1 })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bthemes?\b/i);
  });

  it('the source tip gives 20 reviews, 90 days and a fifth; the decide tip says approved topics also re-check the last 180 days', async () => {
    const s = await tipText('platform.topics', 'source');
    for (const w of ['20', '90 days', 'fifth']) expect(s, w).toContain(w);
    expect(await tipText('platform.topics', 'decide')).toMatch(/180 days/);
    expect(await tipText('platform.topics', 'decided')).toContain('30 days');
  });

  it('with no proposals: a teaching empty state', async () => {
    await show('platform.topics');
    expect(screen.getByText('No proposals waiting')).toBeTruthy();
  });

  it('every tip and empty id used by /platform/topics exists in PAGE_COPY', () => {
    const dir = join(__dirname, 'topics');
    const src = ['page.tsx', 'topic-queue.tsx'].map((f) => readFileSync(join(dir, f), 'utf8')).join(' ');
    const c = (PAGE_COPY as Record<string, PageCopy>)['platform.topics']!;
    expect(c).toBeTruthy();
    expect(src).not.toMatch(/platform\.themes/);
    const ids = [...src.matchAll(/platform\.topics\.([a-z]+)/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) expect(c.tips?.[id] ?? c.empty?.[id], id).toBeTruthy();
  });
});

describe('Ask reviews', () => {
  it('the audit tip says opening a conversation is recorded; the allowed tip names the client setting', async () => {
    expect(await tipText('platform.ask', 'audit')).toMatch(/audit log/);
    expect(await tipText('platform.ask', 'allowed')).toMatch(/allow/i);
    expect(await tipText('platform.ask', 'flags')).toContain('Limit reached');
  });

  it('with no threads: a teaching empty state', async () => {
    await show('platform.ask');
    expect(screen.getByText('No conversations to review')).toBeTruthy();
  });

  it('a thread page keeps the client and agency line and has the citations tip', async () => {
    await show('platform.ask.thread');
    expect(document.body.textContent).toContain('Lone Star · Acme');
    expect(hasTip('Citations and trace')).toBe(true);
    // The assistant goes by the thread agency's name for it, not a hard-coded default.
    expect(screen.getByText('Sunny', { selector: 'span' })).toBeTruthy();
  });
});

describe('Knowledge', () => {
  it('the repo tip says seed articles are read-only and managed in the repo', async () => {
    const t = await tipText('platform.knowledge', 'repo');
    expect(t).toMatch(/read-only/);
    expect(t).toMatch(/repo/);
  });

  it('the status tip says only published articles are found by the assistant', async () => {
    expect(await tipText('platform.knowledge', 'status')).toMatch(/Published/);
  });

  it('with no articles: a teaching empty state', async () => {
    await show('platform.knowledge');
    expect(screen.getByText('No articles yet')).toBeTruthy();
  });

  it('the new-article and edit pages carry the writing tips; a repo article carries the managed tip, a URL article the auto-sync tip', async () => {
    await show('platform.knowledge.new');
    expect(hasTip(copyOf('platform.knowledge.new').tips!.editor!.title)).toBe(true);
    cleanup();
    m.answers.get_kb_article_admin = article({ source: 'seed' });
    await show('platform.knowledge.detail');
    expect(hasTip(copyOf('platform.knowledge.detail').tips!.managed!.title)).toBe(true);
    expect(hasTip(copyOf('platform.knowledge.detail').tips!.autosync!.title)).toBe(false);
    cleanup();
    m.answers.get_kb_article_admin = article({ source: 'url', sourceUrl: 'https://example.com/x', autoSync: true });
    await show('platform.knowledge.detail');
    expect(hasTip(copyOf('platform.knowledge.detail').tips!.autosync!.title)).toBe(true);
    expect(hasTip(copyOf('platform.knowledge.detail').tips!.managed!.title)).toBe(false);
    expect(await tipText('platform.knowledge.detail', 'autosync')).toMatch(/Sunday/);
  });
});

describe('Health', () => {
  it('shows the four sections with their tips and points at Costs for spend', async () => {
    await show('platform.health');
    for (const id of ['spendGuard', 'worker', 'queues', 'vendors', 'sources']) expect(hasTip(copyOf('platform.health').tips![id]!.title), id).toBe(true);
    expect(document.body.textContent).toMatch(/Costs/);
  });

  it('the spend guard tip says what warning and paused mean, and that staff reset it', async () => {
    const t = await tipText('platform.health', 'spendGuard');
    for (const w of ['Warning', 'Paused', 'floor', 'Reset']) expect(t, w).toContain(w);
  });

  it('the tips carry the thresholds the status rules use', async () => {
    expect(await tipText('platform.health', 'worker')).toMatch(/11 minutes.*30 minutes/);
    expect(await tipText('platform.health', 'queues')).toMatch(/30 minutes.*2 hours/);
    const v = await tipText('platform.health', 'vendors');
    for (const w of ['20%', '50%', '48 hours']) expect(v, w).toContain(w);
    expect(await tipText('platform.health', 'sources')).toMatch(/26 hours.*72 hours/);
  });
});

describe('Costs', () => {
  it('the description carries the 06:00 UTC refresh and not the product name', async () => {
    await show('platform.costs');
    expect(document.body.textContent).toContain('06:00 UTC');
    expect(document.body.textContent).not.toMatch(/rival\s*monday/i);
  });

  it('the status tip gives the six statuses and the 7 day default; the Low tip says owners are emailed once', async () => {
    const s = await tipText('platform.costs', 'services');
    for (const w of ['OK', 'Low', 'Error', 'Unavailable on this plan', 'Not configured', 'Off', '7 days', '14 days']) expect(s, w).toContain(w);
    expect(await tipText('platform.costs', 'low')).toMatch(/emailed/);
  });

  it('the projection and chart tips say how they are worked out', async () => {
    expect(await tipText('platform.costs', 'projected')).toMatch(/days in the month/);
    const c = await tipText('platform.costs', 'monthly');
    for (const w of ['six months', 'approximate']) expect(c, w).toContain(w);
    expect(await tipText('platform.costs', 'ai')).toContain('30 days');
  });

  it('the limits tip names the settings and that only changed fields are saved', async () => {
    const t = await tipText('platform.costs', 'limits');
    for (const w of ['default monthly limit', 'snooze', 'Only the fields you change']) expect(t, w).toContain(w);
  });

  it('with no manual costs or AI calls: both teach', async () => {
    await show('platform.costs');
    expect(screen.getByText('No manual costs yet')).toBeTruthy();
    expect(screen.getByText('No AI calls yet')).toBeTruthy();
  });
});

describe('Business types', () => {
  it('the merge tip says what moves and that the old id keeps working; only owners and staff change things', async () => {
    const t = await tipText('platform.verticals', 'merge');
    for (const w of ['clients', 'prices', 'old id']) expect(t, w).toContain(w);
    expect(await tipText('platform.verticals', 'roles')).toMatch(/owners and staff/);
    expect(await tipText('platform.verticals', 'approve')).toMatch(/Approve/);
  });

  it('with nothing to review: both lists teach', async () => {
    await show('platform.verticals');
    expect(screen.getAllByText('Nothing to review')).toHaveLength(2);
  });
});

describe('Platform runbook', () => {
  it('the standard tip says every agency starts from it; the changes tip says agencies take or keep; edit is owners and staff', async () => {
    expect(await tipText('platform.runbook', 'standard')).toMatch(/every agency/);
    expect(await tipText('platform.runbook', 'updates')).toMatch(/keep/i);
    expect(await tipText('platform.runbook', 'edit')).toMatch(/owners and staff/);
  });
});

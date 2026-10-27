// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

/**
 * 15b-2 Task 5, client batch B (Recommendations, Ask, Ask thread, Briefs & reports, Brief, Alert, Report, Evidence,
 * Pitch snapshot): the Guide button follows `list_help_guides` for the client scope, tips and empty states follow the
 * viewer's audience, and the copy is rendered with the viewer's names. Copy never promises Ask when the module is off,
 * and a client never reads agency-only help (or a confidence threshold).
 */
const C = '00000000-0000-4000-8000-0000000000c1';
const T = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const AL = '00000000-0000-4000-8000-0000000000a2';
const R = '00000000-0000-4000-8000-0000000000e2';
const EV = '00000000-0000-4000-8000-0000000000e3';
const m = vi.hoisted(() => ({
  role: 'client_owner', features: ['dashboard', 'ask'] as string[], guides: [] as string[], calls: [] as [string, unknown][],
  recs: true, briefKind: 'weekly' as string, reportData: true, briefsEmpty: false,
}));

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: m.role, userId: 'u1', agencyId: 'a1', clientScope: [C], features: new Set(m.features), planFeatures: new Set(['ask', 'mcp']) } }),
}));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Sunny', assistantNameForRequest: async () => 'Sunny' }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@cs/mcp', () => ({ displayNameFor: async () => null }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ assistantName: 'Sunny' }) }));

const SCORECARD = {
  asOf: '2026-10-12', baselineBriefId: null,
  tiles: [
    { metric: 'rating', you: 4.5, rivalMedian: 4.4, deltaSinceStart: 0.1 }, { metric: 'reviews90d', you: 12, rivalMedian: 10, deltaSinceStart: 2 },
    { metric: 'replyRate', you: 0.5, rivalMedian: 0.4, deltaSinceStart: null }, { metric: 'mapTop3Share', you: 0.3, rivalMedian: 0.2, deltaSinceStart: null },
  ],
  rows: [{ competitorId: null, name: 'Lone Star Cooling', self: true, tier: null, values: { rating: 4.5 } }], evidenceIds: [], openFirstMoves: [],
};
const brief = () => ({
  id: B, clientId: C, deliveryDate: '2026-10-13', status: 'sent', kind: m.briefKind, summary: 'Summary', sentAt: null, hasPdf: false, generatedAt: null,
  periodStart: '2026-10-06T00:00:00.000Z', periodEnd: '2026-10-13T00:00:00.000Z', approvedAt: null,
  scorecard: m.briefKind === 'weekly' ? null : SCORECARD,
  trend: m.briefKind === 'quiet' || m.briefKind === 'weekly' ? { windowDays: 30, events: 1, businesses: [{ competitorId: 'x1', name: 'Smith HVAC', self: false, reviews: 3, avgRating: 4.1, prevAvgRating: 4, activeAds: 2 }] } : null,
  items: m.briefKind === 'quiet' ? [] : [{
    id: 'i1', ord: 0, competitorId: 'x1', subject: 'competitor', competitorName: 'Smith HVAC', headline: 'Smith cut prices', whatChanged: 'Tune-up fell to $59.', whyItMatters: 'It undercuts you.',
    recommendedAction: 'Match it.', confidence: 0.9, effort: 'L', impact: 'M', evidenceIds: ['00000000-0000-4000-8000-0000000000f1'], status: 'active', upsellTag: 'ppc_audit',
  }],
});
const REPORT_DATA = {
  quarter: '2026-Q3', windowDays: 90, businesses: [{ competitorId: 'x1', name: 'Smith HVAC', self: false, reviews: 4, avgRating: 4.2, prevAvgRating: 4.1, activeAds: 1 }],
  eventsByType: { price_change: 2 }, moves: [], briefsSent: 12, alertsDelivered: 3, recommendations: { created: 5, done: 2, inProgress: 1, dismissed: 1 },
};

const tool = async (_ctx: unknown, name: string, input: Record<string, unknown>) => {
  m.calls.push([name, input]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'get_client_profile': return { id: C, name: 'Lone Star Cooling', timezone: 'America/Chicago', verticalId: 'hvac_plumbing' };
    case 'list_recommendations':
      return { items: m.recs ? [{ id: 'r1', title: 'Match the offer', rationale: 'Smith cut prices.', effort: 'L', impact: 'M', owner: 'client', status: 'todo', dismissReason: null, dueAt: null, source: 'brief', evidenceIds: [], upsellTag: 'ppc_audit', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }] : [] };
    case 'get_ask_starters': return { questions: ['What did Smith change?'], reviewAllowed: true };
    case 'list_my_ask_threads': return { items: [] };
    case 'get_my_ask_thread': return { id: T, clientId: C, title: 'Pricing question', messages: [] };
    case 'list_briefs': return { items: m.briefsEmpty ? [] : [{ id: B, clientId: C, deliveryDate: '2026-10-13', status: 'sent', kind: 'weekly', summary: 'Summary', sentAt: null, hasPdf: false, generatedAt: null }], nextCursor: null };
    case 'list_alerts': return { items: m.briefsEmpty ? [] : [{ id: AL, clientId: C, competitorName: 'Smith HVAC', headline: 'Smith cut prices', score: 82, status: 'delivered', createdAt: '2026-10-14T02:00:00.000Z', deliveredAt: null }], nextCursor: null };
    case 'list_trend_reports': return { items: m.briefsEmpty ? [] : [{ id: R, clientId: C, quarter: '2026-Q3', status: 'sent', sentAt: '2026-10-01T15:00:00.000Z', hasPdf: true }] };
    case 'get_brief': return brief();
    case 'get_alert':
      return { id: AL, clientId: C, competitorName: 'Smith HVAC', headline: 'Smith cut prices', score: 82, status: 'delivered', createdAt: '2026-10-14T02:00:00.000Z', deliveredAt: null, body: 'Smith cut tune-ups to $59.', evidenceIds: [], written: 'template' };
    case 'get_trend_report':
      return { id: R, clientId: C, quarter: '2026-Q3', status: 'sent', sentAt: null, hasPdf: false, periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-09-30T00:00:00.000Z', data: m.reportData ? REPORT_DATA : null };
    case 'get_evidence':
      return {
        evidenceId: EV, kind: 'screenshot', sha256: 'abc123', bytes: 10, contentType: 'image/png', captureId: EV, capturedAt: '2026-10-10T12:00:00.000Z', captureStatus: 'ok', channel: 'web', channelLabel: 'Website',
        url: 'https://smithhvac.com/prices', collectorVersion: 'v1', legalHold: false, competitorId: EV, competitorName: 'Smith HVAC', servable: true, citedBy: [],
      };
    case 'compare_captures':
      return { state: 'first', before: null, after: { captureId: EV, capturedAt: '2026-10-10T12:00:00.000Z' }, pageUrl: null, blocks: [], truncated: false, blocksCapped: false, maskedCount: 0 };
    case 'get_prospect_report':
      return {
        report: {
          status: 'ready', createdAt: '2026-09-01T00:00:00.000Z', finishedAt: '2026-09-02T00:00:00.000Z',
          data: {
            generatedAt: '2026-09-02T00:00:00.000Z', keywords: ['ac repair'], points: 9, scanId: null, notes: [],
            businesses: [{ competitorId: 'x1', name: 'Lone Star Cooling', self: true, gbp: { rating: 4.5, reviews: 40, category: 'HVAC', extraCategories: 0 }, ads: { google: null, meta: null }, ranks: [{ keyword: 'ac repair', found: 5, top3: 2, averageRank: 3.4 }] }],
          },
        },
      };
    default: return { items: [] };
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./recommendations/actions', () => ({ setStatusAction: vi.fn() }));
vi.mock('./ask/actions', () => ({ confirmAskAction: vi.fn(), deleteAskThreadAction: vi.fn(), saveAskRecommendation: vi.fn(), askEvidenceRefs: vi.fn(async () => ({})) }));
vi.mock('next/navigation', () => ({
  usePathname: () => `/c/${C}`, notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: Recommendations } = await import('./recommendations/page');
const { AskScreen } = await import('./ask/ask-screen');
const { default: Briefs } = await import('./briefs/page');
const { default: BriefDetail } = await import('./briefs/[briefId]/page');
const { default: AlertDetail } = await import('./alerts/[alertId]/page');
const { default: ReportDetail } = await import('./reports/[reportId]/page');
const { default: EvidenceDetail } = await import('./evidence/[evidenceId]/page');
const { default: PitchSnapshot } = await import('./pitch-snapshot/page');

const sp = Promise.resolve({});
const args = { params: Promise.resolve({ clientId: C }), searchParams: sp };
/** Pages a client can reach. */
const PAGES = [
  ['client.recommendations', () => Recommendations({ params: args.params })],
  // The route files only return <AskScreen/> (an async server component), so the tests call the screen itself.
  ['client.ask', () => AskScreen({ clientId: C, threadId: null })],
  ['client.ask.thread', () => AskScreen({ clientId: C, threadId: T })],
  ['client.briefs', () => Briefs(args)],
  ['client.briefs.detail', () => BriefDetail({ params: Promise.resolve({ clientId: C, briefId: B }) })],
  ['client.alerts.detail', () => AlertDetail({ params: Promise.resolve({ clientId: C, alertId: AL }) })],
  ['client.reports.detail', () => ReportDetail({ params: Promise.resolve({ clientId: C, reportId: R }) })],
  ['client.evidence.detail', () => EvidenceDetail({ params: Promise.resolve({ clientId: C, evidenceId: EV }) })],
] as const;
const page = (key: string) => (PAGES.find(([k]) => k === key) ?? ['', () => PitchSnapshot(args)])[1];

async function show(render_: () => Promise<React.ReactNode>, audience: 'agency' | 'client') {
  m.role = audience === 'agency' ? 'account_manager' : 'client_owner';
  render(<HelpProvider value={{ audience, names: { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' } }}>{await render_()}</HelpProvider>);
}
const tipNames = (names: string[]) => names.map((name) => screen.getByRole('button', { name }));
const hasTip = (name: string) => screen.queryByRole('button', { name }) !== null;
const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  return document.body.textContent ?? '';
};

beforeEach(() => { m.role = 'client_owner'; m.features = ['dashboard', 'ask']; m.guides = []; m.calls = []; m.recs = true; m.briefKind = 'weekly'; m.reportData = true; m.briefsEmpty = false; });
afterEach(cleanup);

describe('client batch B: guide button', () => {
  for (const [key, render_] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read once for this client`, async () => {
      m.guides = [`page:${key}`];
      await show(render_, 'client');
      expect(await screen.findByRole('button', { name: /guide/i }, { timeout: 15_000 })).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides').map(([, i]) => i)).toEqual([{ context: 'client', clientId: C }]);
      cleanup();
      m.guides = ['page:client.other'];
      await show(render_, 'agency');
      expect(screen.queryByRole('button', { name: /guide/i })).toBeNull();
    });
  }

  it('client.pitch-snapshot: agency roles get the Guide button; a client role gets a 404, never a page', async () => {
    m.guides = ['page:client.pitch-snapshot'];
    await show(page('client.pitch-snapshot'), 'agency');
    expect(await screen.findByRole('button', { name: /guide/i }, { timeout: 15_000 })).toBeTruthy();
    cleanup();
    m.role = 'client_owner';
    await expect(PitchSnapshot(args)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('client batch B: Recommendations', () => {
  it('description and the four tips for everyone', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.recommendations'), audience);
      expect(screen.getByText('Next steps from your weekly briefs and detected competitor moves.')).toBeTruthy();
      tipNames(['Recommendation stages', 'Effort and impact', 'For you or Agency', 'Where a recommendation came from']);
      cleanup();
    }
  });

  it('the origin tip names the three sources and does not promise Ask by name', async () => {
    await show(page('client.recommendations'), 'client');
    const text = open('Where a recommendation came from');
    for (const s of ['From weekly brief', 'From a detected move', 'From Ask']) expect(text, s).toContain(s);
    expect(text).not.toMatch(/Sunny/);
  });

  it('empty state offers saving from an assistant answer only when the viewer can (Ask on and may give feedback)', async () => {
    m.recs = false;
    await show(page('client.recommendations'), 'client');
    expect(screen.getByRole('heading', { name: 'No recommendations yet' })).toBeTruthy();
    expect(screen.getByText(/You can also save one from an Sunny answer/)).toBeTruthy();
    cleanup();
    m.features = ['dashboard'];
    await show(page('client.recommendations'), 'client');
    expect(screen.getByText(/Recommendations arrive with each approved weekly brief/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Sunny|\bAsk\b|assistant/);
    cleanup();
    m.features = ['dashboard', 'ask'];
    m.role = 'client_viewer';
    render(<HelpProvider value={{ audience: 'client', names: { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' } }}>{await Recommendations({ params: args.params })}</HelpProvider>);
    expect(document.body.textContent).not.toMatch(/Sunny|assistant/);
  });
});

describe('client batch B: Ask and Ask thread', () => {
  it('Ask: description, and the four tips for client and agency; the privacy tip uses the viewer\'s names and says conversations are private', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.ask'), audience);
      expect(screen.getByText(/Questions about your competitors and market/)).toBeTruthy();
      tipNames(['How answers are checked', 'Starter questions', 'Who can see your questions', 'What Sunny can change']);
      cleanup();
    }
    await show(page('client.ask'), 'client');
    const text = open('Who can see your questions');
    expect(text).toMatch(/private to you/);
    expect(text).toMatch(/Cool Comfort/);
    expect(text).toMatch(/may be reviewed to improve answers/);
    expect(text).not.toMatch(/Rival Monday/i);
    expect(text.endsWith('Delete a conversation with the bin icon beside it and confirm. While conversations may be reviewed, the people named in that line can still read it.')).toBe(true);
  });

  it('Ask: shows no usage or quota wording anywhere on the page (owner decision e4)', async () => {
    await show(page('client.ask'), 'client');
    expect(document.body.textContent).not.toMatch(/quota/i);
    for (const b of screen.getAllByRole('button').filter((x) => x.getAttribute('aria-haspopup') === 'dialog')) {
      fireEvent.click(b);
      expect(document.body.textContent, b.getAttribute('aria-label') ?? '').not.toMatch(/quota|allowance/i);
      fireEvent.click(b);
    }
  });

  it('Ask thread: its own description and the same tips', async () => {
    await show(page('client.ask.thread'), 'client');
    expect(screen.getByText(/A saved conversation/)).toBeTruthy();
    tipNames(['How answers are checked', 'Who can see your questions']);
  });

  it('the answers tip says facts are cited and unsupported sentences are removed, without naming a threshold', async () => {
    await show(page('client.ask'), 'client');
    const text = open('How answers are checked');
    expect(text).toMatch(/Possible reason:/);
    expect(text).toMatch(/removed/);
    expect(text).not.toMatch(/0\.\d|threshold/);
  });
});

describe('client batch B: Briefs & reports', () => {
  it('description with the client name; the kinds tip for everyone; Status chips for agency only', async () => {
    await show(page('client.briefs'), 'client');
    expect(screen.getByText(/Lone Star Cooling's weekly briefs, alerts and quarterly reports/)).toBeTruthy();
    tipNames(['Briefs, alerts and reports']);
    expect(hasTip('Status chips')).toBe(false);
    const text = open('Briefs, alerts and reports');
    expect(text).toMatch(/Monday morning/);
    expect(text).toMatch(/Starting point/);
    cleanup();
    await show(page('client.briefs'), 'agency');
    tipNames(['Briefs, alerts and reports', 'Status chips']);
  });

  it('empty states per tab', async () => {
    m.briefsEmpty = true;
    for (const [tab, title, body] of [
      ['briefs', 'No weekly briefs yet', /first one arrives the Monday after setup is complete/],
      ['alerts', 'No alerts yet', /sent when a competitor makes an urgent change/],
      ['reports', 'No quarterly reports yet', /first week after each quarter ends/],
    ] as const) {
      await show(() => Briefs({ params: args.params, searchParams: Promise.resolve({ tab }) }), 'client');
      expect(screen.getByRole('heading', { name: title }), tab).toBeTruthy();
      expect(screen.getByText(body), tab).toBeTruthy();
      cleanup();
    }
  });
});

describe('client batch B: Brief', () => {
  it('weekly brief: confidence, evidence and last-days tips; no quiet-week or starting-point tip', async () => {
    await show(page('client.briefs.detail'), 'client');
    expect(screen.getByText(/What Lone Star Cooling's competitors did, why it matters and what to do about it/)).toBeTruthy();
    tipNames(['Confidence', 'Evidence links', 'The last-days table']);
    expect(hasTip('Quiet weeks')).toBe(false);
    expect(hasTip('About the starting point')).toBe(false);
  });

  it('the confidence tip explains the percentage in plain words and never states the threshold (agency-only)', async () => {
    await show(page('client.briefs.detail'), 'client');
    const text = open('Confidence');
    expect(text).toMatch(/how well the evidence supports it/);
    expect(text).toMatch(/High confidence/);
    expect(text).not.toMatch(/0\.85|85\s*%|threshold|medium|low confidence/i);
  });

  it('quiet week: the Quiet weeks tip explains Where you stand', async () => {
    m.briefKind = 'quiet';
    await show(page('client.briefs.detail'), 'client');
    tipNames(['Quiet weeks']);
    expect(open('Quiet weeks')).toMatch(/median of the rivals we watch/);
    expect(hasTip('About the starting point')).toBe(false);
  });

  it('starting point: its own tip', async () => {
    m.briefKind = 'starting_point';
    await show(page('client.briefs.detail'), 'client');
    tipNames(['About the starting point']);
    expect(hasTip('Quiet weeks')).toBe(false);
  });
});

describe('client batch B: Alert, Report, Evidence', () => {
  it('Alert: Alert or brief for everyone; the score tip for agency only', async () => {
    await show(page('client.alerts.detail'), 'client');
    expect(screen.getByText(/important enough to send between weekly briefs/)).toBeTruthy();
    tipNames(['Alert or brief']);
    expect(hasTip('Score, status and template text')).toBe(false);
    cleanup();
    await show(page('client.alerts.detail'), 'agency');
    tipNames(['Alert or brief', 'Score, status and template text']);
  });

  it('Report: the four tips when the report has data, none when it has not', async () => {
    await show(page('client.reports.detail'), 'client');
    expect(screen.getByText(/The numbers for one quarter/)).toBeTruthy();
    tipNames(['Reviews, rating and ads', 'Changes detected', 'Moves in the quarter', 'Briefs, alerts and recommendations']);
    cleanup();
    m.reportData = false;
    await show(page('client.reports.detail'), 'client');
    expect(hasTip('Changes detected')).toBe(false);
  });

  it('Evidence: where it was captured, status, fingerprint and retention tips; says "captured by our monitoring service" and explains the hash plainly', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.evidence.detail'), audience);
      expect(screen.getByText(/The stored proof behind a point in a brief or alert/)).toBeTruthy();
      tipNames(['Where this was captured', 'Capture status', 'What the fingerprint is', 'How long evidence is kept']);
      cleanup();
    }
    await show(page('client.evidence.detail'), 'client');
    // The async compare section suspends until its tool read resolves; wait so it cannot swallow the popover clicks.
    await screen.findByText(/first capture of this page/);
    expect(open('Where this was captured')).toMatch(/captured automatically by our monitoring service/);
    expect(open('What the fingerprint is')).toMatch(/changing even one character gives a completely different one/);
  });
});

describe('client batch B: Pitch snapshot (agency only)', () => {
  it('description with the client name and the date; both tips for agency roles', async () => {
    await show(page('client.pitch-snapshot'), 'agency');
    expect(screen.getByText(/The market picture shown to Lone Star Cooling before it became a client.*Generated Sep 1./)).toBeTruthy();
    tipNames(['Where the figures come from', 'Reading map visibility']);
    expect(open('Reading map visibility')).toMatch(/not counted as 21/);
  });
});

describe('client batch B: no agency-only help reaches a client', () => {
  it('every tip popover on every client-reachable page, opened as a client, is free of agency-only wording', async () => {
    for (const [key, render_] of PAGES) {
      m.briefKind = 'weekly';
      await show(render_, 'client');
      const seen = [document.body.textContent ?? ''];
      const tips = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'dialog');
      expect(tips.length, key).toBeGreaterThan(0);
      for (const b of tips) {
        fireEvent.click(b);
        seen.push(document.body.textContent ?? '');
        fireEvent.click(b);
      }
      expect(seen.join('\n'), key).not.toMatch(/\brout(e|ed|ing)\b|upsell|\bseats?\b|AM check|account manager|DataForSEO|Stadia|OpenRouter|Jev\b|rival\s*monday|0\.85|threshold|quota|Settings ›|Approvals|ppc_audit/i);
      cleanup();
    }
  });
});

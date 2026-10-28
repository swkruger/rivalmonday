// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

/**
 * 15b-2 Task 4, client batch A (Competitors, Competitor profile, Pricing, Ads, Local rankings, Moves): the Guide button
 * follows `list_help_guides` for the client scope, tips and empty states follow the viewer's audience, and the copy is
 * rendered with the viewer's names. Agency-only tips (Manual scan limits, suggestions, pinned pages) never reach a client.
 */
const C = '00000000-0000-4000-8000-0000000000c1';
const X = '00000000-0000-4000-8000-0000000000d1';
const MV = '00000000-0000-4000-8000-0000000000e1';
const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';
const m = vi.hoisted(() => ({ role: 'client_owner', guides: [] as string[], calls: [] as [string, unknown][], empty: false, noPrices: false, setup: 'ready' as string }));

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: m.role, userId: 'u1', agencyId: 'a1', clientScope: [C], features: new Set(['dashboard']) } }),
}));

const SIGNALS = {
  rating: 4.2, votes: 80, reviews30d: 6, reviews90d: null, replyRate: null, googleAdsActive: 2, googleAdsNew30d: 1, googleAccount: null,
  metaPage: 'none', metaAdsActive: null, claimed: null, chain: null, categoryMatch: null, distanceKm: null, presence: null,
};
const scan = (id: string, at: string) => ({ id, finishedAt: at });
const geo = () => ({
  setup: m.setup, scan: scan(S2, '2026-10-04T00:00:00.000Z'), scans: [scan(S2, '2026-10-04T00:00:00.000Z'), scan(S1, '2026-09-27T00:00:00.000Z')],
  keywords: ['ac repair'], keyword: 'ac repair', businesses: [{ key: 'self', name: 'Lone Star Cooling', self: true }], business: 'self', size: 2, cells: [[1, 2], [3, 21]],
  top3: 3, points: 4, avgRank: 6.8, keywordSummaries: [], radiusKm: 25, lats: [30.3, 30.2], lngs: [-97.8, -97.7], map: null,
});
const trendScan = (id: string, at: string) => ({ scanId: id, finishedAt: at, settingsKey: 'k', settingsChanged: false, self: { avgRank: 3, top3Share: 0.5, points: 4 }, competitors: [] });

const tool = async (_ctx: unknown, name: string, input: Record<string, unknown>) => {
  m.calls.push([name, input]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'get_client_profile': return { id: C, name: 'Lone Star Cooling', timezone: 'America/Chicago', status: 'active', keywords: ['ac repair'], serviceArea: { radiusKm: 25 }, placeId: 'p1', verticalId: 'hvac_plumbing' };
    // Competitors
    case 'list_client_competitors':
      return { items: m.empty ? [] : [{ id: X, name: 'Smith HVAC', domain: 'smithhvac.com', placeId: null, addedAt: '2026-09-01T00:00:00.000Z', activePages: 3 }], limit: 5 };
    case 'list_competitor_suggestions': return { suggestions: [], hiddenList: [] };
    case 'get_competitor_search_status': return { status: 'none', nextManualSearchAt: null };
    case 'get_competitor_signals': return { competitors: m.empty ? [] : [{ competitorId: X, tier: 'top', signals: SIGNALS, computedAt: '2026-10-13T09:00:00.000Z' }] };
    // Competitor profile
    case 'get_competitor_profile':
      return {
        competitorId: X, name: 'Smith HVAC', domain: 'smithhvac.com', placeId: null, addedAt: '2026-09-01T00:00:00.000Z', gbp: null, gbpAsOf: null, activeAds: { google: 1, meta: 0 },
        pressure: { score: 40, level: 'elevated', reasons: [] }, openMoves: 1, pages: { active: 3, blocked: 0 },
        sources: [{ source: 'ads', label: 'Ads', active: true, lastRunAt: '2026-10-13T00:00:00.000Z', lastStatus: 'ok' }],
      };
    case 'get_competitor_timeline': return { items: [] };
    case 'list_tracked_pages': return { items: [{ id: 'p1', url: 'https://smithhvac.com/prices', pageType: 'pricing', source: 'sitemap', pinned: false, active: true, cadence: 'weekly', lastCapturedAt: null }] };
    case 'get_competitor_ad_matches': return { matched: [], pending: [] };
    case 'get_topic_benchmark': return { windowDays: 90, from: '', to: '', topics: [], businesses: [] };
    // Pricing
    case 'get_price_matrix':
      return m.empty
        ? { services: [], rows: [] }
        : {
          services: [{ id: 'tune_up', name: 'AC tune-up', offered: true }],
          rows: [{ competitorId: X, name: 'Smith HVAC', cells: m.noPrices ? [] : [{ serviceId: 'tune_up', prices: [{ amount: 89, unit: 'USD', qualifier: null, promo: false, since: '2026-10-01T00:00:00.000Z' }], change: { before: 99, after: 89 } }] }],
        };
    // Ads
    case 'get_ad_activity': return { weeks: ['2026-10-04'], series: [{ competitorId: X, name: 'Smith HVAC', points: [1] }] };
    case 'list_ads':
      return {
        items: m.empty ? [] : [{ id: 'a1', competitorId: X, competitorName: 'Smith HVAC', platform: 'meta', format: 'image', title: '$49 tune-up', text: 'Book now', landingUrl: null, firstSeenAt: '2026-09-12T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z', endedAt: null, active: true, libraryUrl: null }],
        hasMore: false,
      };
    // Rankings
    case 'get_geogrid': return geo();
    case 'get_rank_trend': return { scans: [trendScan(S2, '2026-10-04T00:00:00.000Z'), trendScan(S1, '2026-09-27T00:00:00.000Z')], nextCursor: null };
    case 'get_share_of_voice': return { keyword: null, keywords: ['ac repair'], scans: [], series: [] };
    case 'get_rank_settings': return { keywords: ['ac repair'], allKeywords: ['ac repair'], gridSize: 7, radiusKm: 25, scan: { state: 'available', nextAvailableAt: null, label: null } };
    // Moves
    case 'list_moves':
      return { items: m.empty ? [] : [{ id: MV, competitorId: X, competitorName: 'Smith HVAC', moveType: 'territory_expansion', label: 'Territory expansion', status: 'emerging', confidence: 0.55, summary: '', eventCount: 3, channels: ['web'], firstDetectedAt: '2026-09-17T00:00:00Z', lastEvidenceAt: '2026-10-08T00:00:00Z', closedAt: null }] };
    case 'get_move':
      return { id: MV, competitorId: X, competitorName: 'Smith HVAC', moveType: 'territory_expansion', label: 'Territory expansion', status: 'emerging', confidence: 0.55, summary: '', eventCount: 3, channels: ['web'], firstDetectedAt: '2026-09-17T00:00:00Z', lastEvidenceAt: '2026-10-08T00:00:00Z', closedAt: null, facts: [], events: [] };
    default: return { items: [] };
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ webMonitoring: true }) }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./competitors/actions', () => ({
  requestSuggestionsAction: vi.fn(), acceptSuggestionsAction: vi.fn(), dismissSuggestionAction: vi.fn(), addCompetitorAction: vi.fn(), removeCompetitorAction: vi.fn(), searchStatusAction: vi.fn(),
  setPinAction: vi.fn(), addPageAction: vi.fn(), confirmAdMatchAction: vi.fn(), removeAdMatchAction: vi.fn(),
}));
vi.mock('./rankings/actions', () => ({ saveRankSettings: vi.fn(), requestRankScan: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => `/c/${C}`, notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: Competitors } = await import('./competitors/page');
const { default: CompetitorProfile } = await import('./competitors/[competitorId]/page');
const { default: Pricing } = await import('./pricing/page');
const { default: Ads } = await import('./ads/page');
const { default: Rankings } = await import('./rankings/page');
const { default: Moves } = await import('./moves/page');

const sp = Promise.resolve({});
const args = { params: Promise.resolve({ clientId: C }), searchParams: sp };
const PAGES = [
  ['client.competitors', () => Competitors({ params: args.params })],
  ['client.competitors.detail', () => CompetitorProfile({ params: Promise.resolve({ clientId: C, competitorId: X }), searchParams: sp })],
  ['client.pricing', () => Pricing(args)],
  ['client.ads', () => Ads(args)],
  ['client.rankings', () => Rankings(args)],
  ['client.moves', () => Moves(args)],
] as const;
const page = (key: (typeof PAGES)[number][0]) => PAGES.find(([k]) => k === key)![1];

async function show(render_: () => Promise<React.ReactNode>, audience: 'agency' | 'client') {
  m.role = audience === 'agency' ? 'account_manager' : 'client_owner';
  render(<HelpProvider value={{ audience, names: { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' } }}>{await render_()}</HelpProvider>);
}
const tipNames = (names: string[]) => names.map((name) => {
  const els = screen.getAllByRole('button', { name });
  expect(els.length, name).toBeGreaterThan(0);
  return els[0];
});
const hasTip = (name: string) => screen.queryByRole('button', { name }) !== null;

beforeEach(() => { m.guides = []; m.calls = []; m.empty = false; m.noPrices = false; m.setup = 'ready'; });
afterEach(cleanup);

describe('client batch A: guide button', () => {
  for (const [key, render_] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read for this client`, async () => {
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
});

describe('client batch A: descriptions and tips by audience', () => {
  it('Competitors: tiers, Rated date and signal tips for everyone; suggestions only for agency; count kept in the description', async () => {
    await show(page('client.competitors'), 'client');
    expect(screen.getByText(/The competitors monitored for Lone Star Cooling/)).toBeTruthy();
    expect(screen.getByText(/1 of 5 tracked/)).toBeTruthy();
    tipNames(['Competitor tiers', 'The "Rated" date', 'What is Signal?']);
    expect(hasTip('Suggested competitors')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Competitor tiers' }));
    for (const t of ['Top rival', 'Worth watching', 'Minor']) expect(document.body.textContent, t).toContain(t);
    cleanup();
    await show(page('client.competitors'), 'agency');
    tipNames(['Competitor tiers', 'The "Rated" date', 'Suggested competitors']);
  });

  it('Competitor profile: pressure, collection, pages and moves tips; pinned pages for agency only; shared tier and Rated tips', async () => {
    await show(page('client.competitors.detail'), 'client');
    expect(screen.getByText(/Everything monitored for this competitor/)).toBeTruthy();
    expect(screen.getByText(/Tracked since/)).toBeTruthy();
    tipNames(['What is Competitive pressure?', 'Collection status', 'Pages monitored', 'Open moves', 'Competitor tiers', 'The "Rated" date']);
    expect(hasTip('Pinned pages')).toBe(false);
    cleanup();
    await show(page('client.competitors.detail'), 'agency');
    tipNames(['Pinned pages']);
  });

  it('Pricing: the change tag and Your service tips for everyone', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.pricing'), audience);
      expect(screen.getByText(/What each competitor charges on its website now/)).toBeTruthy();
      tipNames(['Price change tag', '"Your service" tag']);
      cleanup();
    }
  });

  it('Ads: weekly chart, status and targeting tips for everyone', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.ads'), audience);
      tipNames(['Active ads per week', 'Active and ended ads', 'Targeting']);
      cleanup();
    }
  });

  it('Rankings: grid, average rank, share of voice and schedule tips for everyone; Manual scan limits for agency only', async () => {
    await show(page('client.rankings'), 'client');
    expect(screen.getByText(/Where each business shows up in Google’s local results/)).toBeTruthy();
    tipNames(['The rank grid', 'Average map rank', 'Share of voice', 'When scans run']);
    expect(hasTip('Manual scan limits')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Scan now' })).toBeNull();
    cleanup();
    await show(page('client.rankings'), 'agency');
    tipNames(['The rank grid', 'Average map rank', 'Share of voice', 'When scans run', 'Manual scan limits']);
  });

  it('Rankings Compare tab: the compare tip for everyone', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(() => Rankings({ params: args.params, searchParams: Promise.resolve({ tab: 'compare' }) }), audience);
      tipNames(['Compare two scans']);
      cleanup();
    }
  });

  it('Moves: statuses tip, and the changes tip once a move is selected', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(page('client.moves'), audience);
      expect(screen.getByText(/Patterns across several changes/)).toBeTruthy();
      tipNames(['Move statuses', 'Changes behind a move']);
      cleanup();
    }
  });

  it('client viewers never see agency-only help text on any batch A page', async () => {
    for (const [, render_] of PAGES) {
      await show(render_, 'client');
      const seen = [document.body.textContent ?? ''];
      const tips = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'dialog');
      expect(tips.length).toBeGreaterThan(0);
      for (const b of tips) {
        fireEvent.click(b);
        seen.push(document.body.textContent ?? '');
        fireEvent.click(b);
      }
      expect(seen.join('\n')).not.toMatch(/\brout(e|ed|ing)\b|upsell|\bseats?\b|AM check|account manager|DataForSEO|Stadia|per agency|10 .*a day|manual scan/i);
      cleanup();
    }
  });
});

describe('client batch A: Rankings scan facts come from the code', () => {
  it('the agency Manual scan limits tip states 1 per client per 7 days and 10 per agency a day; the grid tip says 21 never appears (20+)', async () => {
    await show(page('client.rankings'), 'agency');
    fireEvent.click(screen.getByRole('button', { name: 'Manual scan limits' }));
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/once every 7 days/);
    expect(text).toMatch(/10 manual scans a day/);
    expect(text).toMatch(/Sunday/);
  });

  it('the average rank tip says a point outside the first 20 counts as 21', async () => {
    await show(page('client.rankings'), 'client');
    fireEvent.click(screen.getByRole('button', { name: 'Average map rank' }));
    expect(document.body.textContent).toMatch(/counts as 21/);
  });

  it('the schedule tip tells a client the scan runs once a week and never names the Manual scan limits', async () => {
    await show(page('client.rankings'), 'client');
    fireEvent.click(screen.getByRole('button', { name: 'When scans run' }));
    expect(document.body.textContent).toMatch(/once a week/);
    expect(document.body.textContent).not.toMatch(/7 days|10 /);
  });
});

describe('client batch A: empty states by audience', () => {
  it('Competitors: agency gets a next step, a client without competitor rights is told their agency sets them up', async () => {
    m.empty = true;
    await show(page('client.competitors'), 'client');
    expect(screen.getByRole('heading', { name: 'No competitors tracked yet' })).toBeTruthy();
    expect(screen.getByText('Your competitors appear here once Cool Comfort has set them up.')).toBeTruthy();
    expect(screen.queryByText(/Accept a suggestion/)).toBeNull();
    cleanup();
    await show(page('client.competitors'), 'agency');
    expect(screen.getByText(/Accept a suggestion below or add one by name/)).toBeTruthy();
    expect(screen.queryByText(/appear here once/)).toBeNull();
  });

  it('Pricing: no competitors (per audience) and no prices yet', async () => {
    m.empty = true;
    await show(page('client.pricing'), 'client');
    expect(screen.getByText('Your competitors appear here once Cool Comfort has set them up.')).toBeTruthy();
    cleanup();
    await show(page('client.pricing'), 'agency');
    expect(screen.getByText(/Add competitors on the Competitors page/)).toBeTruthy();
    cleanup();
    m.empty = false;
    m.noPrices = true;
    await show(page('client.pricing'), 'client');
    expect(screen.getByRole('heading', { name: 'No prices found yet' })).toBeTruthy();
  });

  it('Ads: no ads match', async () => {
    m.empty = true;
    await show(page('client.ads'), 'client');
    expect(screen.getByRole('heading', { name: 'No ads match these filters' })).toBeTruthy();
  });

  it('Rankings: no keywords says who sets them up, per audience', async () => {
    m.setup = 'no_keywords';
    await show(page('client.rankings'), 'client');
    expect(screen.getByRole('heading', { name: 'Rank tracking has not started' })).toBeTruthy();
    expect(screen.getByText(/Cool Comfort has set up Lone Star Cooling's keywords and service area/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open Business profile' })).toBeNull();
    cleanup();
    await show(page('client.rankings'), 'agency');
    expect(screen.getByRole('link', { name: 'Open Business profile' })).toBeTruthy();
  });

  it('Rankings: no scan yet', async () => {
    m.setup = 'no_scan';
    await show(page('client.rankings'), 'client');
    expect(screen.getByRole('heading', { name: 'No scan yet' })).toBeTruthy();
  });

  it('Moves: no open moves', async () => {
    m.empty = true;
    await show(page('client.moves'), 'client');
    expect(screen.getByRole('heading', { name: 'No open moves' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pick a move' })).toBeTruthy();
  });
});

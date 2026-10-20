// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-context';

/**
 * 15b-1 pilot pages (Overview, Changes, Reviews): the Guide button follows `list_help_guides` for the page's own client
 * scope, tips and empty states follow the viewer's audience, and the copy is rendered with the viewer's names.
 */
const C = '00000000-0000-4000-8000-0000000000c1';
const m = vi.hoisted(() => ({ role: 'client_owner', features: ['dashboard'] as string[], guides: [] as string[], calls: [] as [string, unknown][] }));

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: m.role, userId: 'u1', agencyId: 'a1', clientScope: [C], features: new Set(m.features) } }),
}));
const tool = async (_ctx: unknown, name: string, input: unknown) => {
  m.calls.push([name, input]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'get_client_profile': return { id: C, name: 'Lone Star Cooling', verticalId: 'hvac_plumbing', services: [] };
    case 'get_workspace_overview':
      return { clientId: C, trackedCompetitors: 0, zips: 0, changes7d: 0, alerts7d: 0, priceMoves7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, rating: { self: null, competitorAverage: null }, pressure: [], pitchSnapshot: false };
    case 'get_ad_activity': return { weeks: [], series: [] };
    case 'get_starting_point_status': case 'get_client_setup': return null;
    case 'search_events': case 'search_reviews': return { items: [], hasMore: false };
    case 'get_theme_benchmark': return { themes: [], businesses: [] };
    case 'get_rating_trend': return { months: [], businesses: [], selfPending: false };
    default: return { items: [] };
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [] }));
vi.mock('@/components/ask/ask-card', () => ({ AskCard: () => null }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./changes/actions', () => ({ submitFeedbackAction: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => `/c/${C}`, notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const { default: Overview } = await import('./page');
const { default: Changes } = await import('./changes/page');
const { default: Reviews } = await import('./reviews/page');

const args = { params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve({}) };
const PAGES = [
  ['client.overview', () => Overview(args)],
  ['client.changes', () => Changes(args)],
  ['client.reviews', () => Reviews(args)],
] as const;

async function show(page: () => Promise<React.ReactNode>, audience: 'agency' | 'client') {
  m.role = audience === 'agency' ? 'account_manager' : 'client_owner';
  render(<HelpProvider value={{ audience, names: { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' } }}>{await page()}</HelpProvider>);
}

beforeEach(() => { m.guides = []; m.calls = []; m.features = ['dashboard']; });
afterEach(cleanup);

describe('pilot pages: guide button', () => {
  for (const [key, page] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read for this client`, async () => {
      m.guides = [`page:${key}`];
      await show(page, 'client');
      // The Guide button sits behind a next/dynamic import (a lazy chunk), so under full-suite load it needs more than the 1 s findBy default.
      expect(await screen.findByRole('button', { name: /guide/i }, { timeout: 15_000 })).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides').map(([, i]) => i)).toEqual([{ context: 'client', clientId: C }]);
      cleanup();
      m.guides = ['page:client.other'];
      await show(page, 'agency');
      expect(screen.queryByRole('button', { name: /guide/i })).toBeNull();
    });
  }
});

describe('pilot pages: copy, tips and empty states by audience', () => {
  it('Overview: description with the client name, KPI and pressure tips, audience-specific empty state', async () => {
    await show(PAGES[0][1], 'client');
    expect(screen.getByText(/How Lone Star Cooling compares with its competitors this week\./)).toBeTruthy();
    for (const name of ['Changes this week', 'Competitor price moves', 'Active competitor ads', 'Your rating vs area', 'Competitive pressure']) {
      expect(screen.getByRole('button', { name }), name).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'What is Move?' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No briefs yet' })).toBeTruthy();
    expect(screen.getByText('Your competitors appear here once Cool Comfort has set them up.')).toBeTruthy();
    cleanup();
    await show(PAGES[0][1], 'agency');
    expect(screen.getByText('Add competitors on the Competitors page to see how much pressure each one puts on Lone Star Cooling.')).toBeTruthy();
  });

  it('Overview: the no-recommendations empty state offers saving from an assistant answer only when Ask is on and the viewer can give feedback', async () => {
    m.features = ['dashboard', 'ask'];
    await show(PAGES[0][1], 'client');
    expect(screen.getByText('New recommendations come with each brief. You can also save one from an Sunny answer.')).toBeTruthy();
    cleanup();
    m.features = ['dashboard'];
    await show(PAGES[0][1], 'client');
    expect(screen.getByText('New recommendations come with each brief.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/save one from/);
    cleanup();
    m.features = ['dashboard', 'ask'];
    m.role = 'client_viewer';
    render(<HelpProvider value={{ audience: 'client', names: { agency: 'Cool Comfort', assistant: 'Sunny', client: 'Lone Star Cooling' } }}>{await Overview(args)}</HelpProvider>);
    expect(screen.getByText('New recommendations come with each brief.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/save one from/);
  });

  it('Changes: clients get the plain route tip, agency staff the routing tip; the empty states use the new copy', async () => {
    await show(PAGES[1][1], 'client');
    expect(screen.getByText("Everything Lone Star Cooling's competitors changed, scored for how much it matters. Every change links to its evidence.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alert, Brief and Archived' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Routing' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'No changes match these filters' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show all changes, including archived' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pick a change' })).toBeTruthy();
    cleanup();
    await show(PAGES[1][1], 'agency');
    fireEvent.click(screen.getByRole('button', { name: 'Routing' }));
    expect(screen.getByText(/Change Lone Star Cooling's levels under Settings › Alert rules\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Alert, Brief and Archived' })).toBeNull();
  });

  it('Reviews: heatmap, rating mix and trend tips for everyone; the empty list uses the new copy', async () => {
    for (const audience of ['client', 'agency'] as const) {
      await show(PAGES[2][1], audience);
      expect(screen.getByText('What customers say about Lone Star Cooling and its competitors on Google.')).toBeTruthy();
      for (const name of ['Reading the heatmap', 'Your rating mix', 'Rating trend']) expect(screen.getByRole('button', { name }), `${audience} ${name}`).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'No reviews match' })).toBeTruthy();
      cleanup();
    }
  });

  it('client viewers never see agency-only help text on any pilot page', async () => {
    for (const [, page] of PAGES) {
      await show(page, 'client');
      // The page text plus every tip's popover text, one tip open at a time.
      const seen = [document.body.textContent ?? ''];
      const tips = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'dialog');
      expect(tips.length).toBeGreaterThan(0);
      for (const b of tips) {
        fireEvent.click(b);
        seen.push(document.body.textContent ?? '');
        fireEvent.click(b);
      }
      expect(seen.join('\n')).not.toMatch(/\brout(e|ed|ing)\b|upsell|\bseats?\b|AM check/i);
      expect(seen.join('\n')).toMatch(/0 to 100|Rows are review topics|Alert: important enough/);
      cleanup();
    }
  });
});

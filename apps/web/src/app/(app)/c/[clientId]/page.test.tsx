// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_admin', userId: 'u1', features: ['dashboard'] } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasFeature: () => true, hasPermission: () => false }));
vi.mock('@/components/ask/ask-card', () => ({ AskCard: () => null }));
const briefView = vi.fn();
vi.mock('@/components/views/brief-view', () => ({ BriefView: (p: unknown) => { briefView(p); return null; } }));
vi.mock('@/components/charts/line-chart', () => ({ LineChart: () => null, foldSeries: () => [] }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => <button type="button" aria-label="tip" /> }));
vi.mock('@/components/help/help-context', () => ({ HelpText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: ({ title }: { title: string }) => <p data-testid="empty">{title}</p>, HelpEmpty: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: ({ title }: { title: string }) => <div role="heading" aria-level={1}>{title}</div> }));
const firstVisit = vi.fn();
vi.mock('@/components/client/owner-first-visit', () => ({ OwnerFirstVisit: (p: unknown) => { firstVisit(p); return <p>first visit</p>; } }));
vi.mock('@/components/setup-badge', () => ({ openSetupSteps: () => null, SetupBadge: () => null }));
vi.mock('./moves/move-card', () => ({ MoveCard: () => null, movesHref: () => '/moves' }));

import { countPrimaryActions } from '@/components/page-header-guard';
import ClientHome from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const overview = {
  weekly: { changes: [], priceMoves: [], activeAds: [] }, trackedCompetitors: 1, rating: { self: null, competitorAverage: null }, zips: 0, changes7d: 0, alerts7d: 0, pitchSnapshot: false,
  priceMoves7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null,
  pressure: [{ competitorId: 'k1', name: 'Smith HVAC', pressure: { score: 90, level: 'high', reasons: [] } }],
};
const tools: Record<string, unknown> = {};
const show = async () => render(await ClientHome({ params: Promise.resolve({ clientId: C }) }));

describe('Client Overview (15c-2b-2)', () => {
  beforeEach(() => {
    callTool.mockReset();
    briefView.mockReset();
    for (const k of Object.keys(tools)) delete tools[k];
    Object.assign(tools, {
      get_client_profile: { id: C, name: 'Cool Air' },
      get_workspace_overview: overview,
      get_ad_activity: { weeks: [], series: [] },
    });
    callTool.mockImplementation(async (_c: unknown, name: string) => tools[name] ?? { items: [] });
  });

  it('hands the owner first-visit panel the setup read, viewer and context', async () => {
    tools.get_client_setup = { state: { competitors: 'waiting_owner' }, invite: { name: null } };
    tools.get_starting_point_status = { state: 'sent' };
    await show();
    expect(screen.getByText('first visit')).toBeTruthy();
    expect(firstVisit).toHaveBeenCalledWith(expect.objectContaining({ clientId: C, setup: tools.get_client_setup, viewer: { kind: 'user' }, startingPending: false }));
  });

  it('pressure bar uses bg-danger for high', async () => {
    await show();
    const bar = screen.getByRole('img', { name: /Competitive pressure 90 of 100, high/ }).firstElementChild as HTMLElement;
    expect(bar.className).toContain('bg-danger');
    expect(bar.className).not.toContain('bg-[#');
  });

  it('open recommendation shows an "In progress" chip', async () => {
    tools.list_recommendations = { items: [{ id: 'r1', title: 'Match the tune-up price', status: 'in_progress' }] };
    await show();
    expect(screen.getByText('Match the tune-up price')).toBeTruthy();
    expect(screen.getByText('In progress').getAttribute('data-slot')).toBe('status-chip');
  });

  it('starting point review link names the brief', async () => {
    tools.get_starting_point_status = { state: 'ready_for_review' };
    tools.list_briefs = { items: [{ id: 'b7', kind: 'starting_point', status: 'ready', deliveryDate: '2026-10-05', summary: '' }] };
    await show();
    expect(screen.getByRole('link', { name: 'Review it' }).getAttribute('href')).toBe('/agency/approvals/b7');
  });

  it('KPIs render as one strip with four h2 titles (16b)', async () => {
    const { container } = await show();
    const strips = container.querySelectorAll('[data-slot="kpi-strip"]');
    expect(strips).toHaveLength(1);
    expect([...strips[0]!.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Changes this week', 'Competitor price moves', 'Active competitor ads', 'Your rating vs area']);
  });

  it('an empty overview shows "—" values with their hints (16b)', async () => {
    const { container } = await show();
    const strip = container.querySelector('[data-slot="kpi-strip"]') as HTMLElement;
    expect([...strip.querySelectorAll('[data-slot="kpi"]')].map((k) => k.textContent)).toEqual([
      'Changes this week0Across websites, ads, reviews and profiles',
      'Competitor price moves0On services you also offer',
      'Active competitor ads—The first weekly ad check fills this in',
      'Your rating vs area—Add your Google Place ID to compare',
    ]);
  });

  it('no brief and no starting point: the empty state sits in a Section, no summary Band (16b)', async () => {
    tools.get_starting_point_status = { state: 'sent' };
    const { container } = await show();
    const empty = screen.getByText('No briefs yet');
    expect(empty.closest('section[data-slot="section"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="band"]')).toBeNull();
    expect(briefView).not.toHaveBeenCalled();
  });

  it('a delivered brief renders BriefView on the overview surface (16b)', async () => {
    tools.list_briefs = { items: [{ id: 'b1', kind: 'weekly', status: 'sent', deliveryDate: '2026-10-19', generatedAt: '2026-10-16T00:00:00Z', summary: 'S' }] };
    tools.get_brief = { id: 'b1', kind: 'weekly', status: 'sent', deliveryDate: '2026-10-19', summary: 'S', items: [] };
    await show();
    expect(briefView).toHaveBeenCalledWith(expect.objectContaining({ surface: 'overview', archiveHref: `/c/${C}/briefs` }));
  });

  it('the starting-point notice is a muted Band (16b)', async () => {
    tools.get_starting_point_status = { state: 'ready_for_review' };
    tools.list_briefs = { items: [{ id: 'b7', kind: 'starting_point', status: 'ready', deliveryDate: '2026-10-05', summary: '' }] };
    await show();
    const band = screen.getByRole('link', { name: 'Review it' }).closest('[data-slot="band"]');
    expect(band?.getAttribute('data-tone')).toBe('muted');
  });

  it('sections replace cards; pairs sit in hairline grids; at most one primary action (16b)', async () => {
    const { container } = await show();
    for (const name of ['Competitive pressure', 'Recent alerts', 'Moves detected', 'Recommendations', 'Competitor ad activity', 'Past briefs', 'Quarterly reports']) {
      const h = screen.getByRole('heading', { level: 2, name });
      expect(h.closest('section[data-slot="section"]'), name).toBeTruthy();
      expect(h.querySelector('button'), `${name}: help tip outside the heading`).toBeNull();
    }
    // Help tips sit beside the headings, not inside them (D1: heading names unchanged).
    expect(screen.getByRole('heading', { level: 2, name: 'Moves detected' })).toBeTruthy();
    const grids = container.querySelectorAll('[data-slot="hairline-grid"]');
    expect(grids).toHaveLength(2);
    for (const g of grids) expect(g.querySelectorAll(':scope > [data-slot="hairline-cell"]')).toHaveLength(2);
    expect(screen.getByText('0 open')).toBeTruthy();
    expect(countPrimaryActions(container)).toBeLessThanOrEqual(1);
  });
});

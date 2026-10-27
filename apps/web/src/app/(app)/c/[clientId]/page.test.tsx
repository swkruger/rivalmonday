// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_admin', userId: 'u1', features: ['dashboard'] } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasFeature: () => true, hasPermission: () => false }));
vi.mock('@/components/ask/ask-card', () => ({ AskCard: () => null }));
vi.mock('@/components/views/brief-view', () => ({ BriefView: () => null }));
vi.mock('@/components/charts/line-chart', () => ({ LineChart: () => null, foldSeries: () => [] }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null, HelpEmpty: () => null }));
vi.mock('@/components/page-header', () => ({ PageHeader: ({ title }: { title: string }) => <div role="heading" aria-level={1}>{title}</div> }));
const firstVisit = vi.fn();
vi.mock('@/components/client/owner-first-visit', () => ({ OwnerFirstVisit: (p: unknown) => { firstVisit(p); return <p>first visit</p>; } }));
vi.mock('@/components/setup-badge', () => ({ openSetupSteps: () => null, SetupBadge: () => null }));
vi.mock('./moves/move-card', () => ({ MoveCard: () => null, movesHref: () => '/moves' }));

import ClientHome from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const overview = {
  trackedCompetitors: 1, rating: { self: null, competitorAverage: null }, zips: 0, changes7d: 0, alerts7d: 0, pitchSnapshot: false,
  pressure: [{ competitorId: 'k1', name: 'Smith HVAC', pressure: { score: 90, level: 'high', reasons: [] } }],
};
const tools: Record<string, unknown> = {};
const show = async () => render(await ClientHome({ params: Promise.resolve({ clientId: C }) }));

describe('Client Overview (15c-2b-2)', () => {
  beforeEach(() => {
    callTool.mockReset();
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
});

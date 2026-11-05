// @vitest-environment jsdom
// app-style Task 10 (AS8): client workspace pages sit under the ink title band; settings do not. Real PageHeader.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_admin', userId: 'u1', features: ['dashboard'] } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/server/evidence-refs', () => ({ evidenceRefsFor: async () => ({}) }));
vi.mock('@/components/ask/ask-card', () => ({ AskCard: () => null }));
vi.mock('@/components/views/brief-view', () => ({ BriefView: () => null }));
vi.mock('@/components/charts/line-chart', () => ({ LineChart: () => null, foldSeries: () => [] }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null, HelpEmpty: () => null }));
vi.mock('@/components/client/owner-first-visit', () => ({ OwnerFirstVisit: () => null }));
vi.mock('@/components/setup-badge', () => ({ openSetupSteps: () => null, SetupBadge: () => null }));
vi.mock('@/components/recommendation-board', () => ({ RecommendationBoard: () => null }));
vi.mock('./moves/move-card', () => ({ MoveCard: () => null, movesHref: () => '/moves' }));
vi.mock('./recommendations/actions', () => ({ setStatusAction: vi.fn() }));
vi.mock('@/components/ask/friday-dock-trigger', () => ({ FridayDockTrigger: () => null }));

import ClientHome from './page';
import Recommendations from './recommendations/page';

const C = '00000000-0000-4000-8000-0000000000c1';
const overview = {
  weekly: { changes: [], priceMoves: [], activeAds: [] }, trackedCompetitors: 1, rating: { self: null, competitorAverage: null }, zips: 0, changes7d: 0, alerts7d: 0, pitchSnapshot: false,
  priceMoves7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, pressure: [],
};
const tools: Record<string, unknown> = {
  get_client_profile: { id: C, name: 'Cool Air', timezone: 'UTC' },
  get_workspace_overview: overview,
  get_ad_activity: { weeks: [], series: [] },
  get_rating_trend: { months: [], businesses: [], selfPending: false },
  list_recommendations: { items: [] },
};
callTool.mockImplementation(async (_c: unknown, name: string) => tools[name] ?? { items: [] });
const params = { params: Promise.resolve({ clientId: C }) };

describe('ink title band on client pages', () => {
  it('overview has the band', async () => {
    const { container } = render(await ClientHome(params));
    expect(container.querySelector('[data-slot="page-header-band"]')).not.toBeNull();
  });
  it('recommendations has the band', async () => {
    const { container } = render(await Recommendations(params));
    expect(container.querySelector('[data-slot="page-header-band"]')).not.toBeNull();
  });
});

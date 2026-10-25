// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const viewer = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => viewer() }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Acme Agency' } }) }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.test' }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/components/ai-connections', () => ({ AccessTokensCard: () => null, ConnectedAppsCard: () => null, ConnectorUrlCard: () => null }));
vi.mock('./actions', () => ({ createAgencyTokenAction: vi.fn(), revokeAgencyGrantAction: vi.fn(), revokeAgencyTokenAction: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import AgencyAiConnectionsPage from './page';

const ctxOf = (role: string, planFeatures: string[]) => ({ role, agencyId: 'a1', clientScope: 'all', features: new Set<string>(), planFeatures: new Set(planFeatures) });
const open = () => AgencyAiConnectionsPage();

afterEach(cleanup);
describe('AgencyAiConnectionsPage', () => {
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockResolvedValue({ items: [] });
  });

  // The page is the agency's AI connections (MCP tokens and apps), so the plan feature it gates on is `mcp`, not `ask`.
  it('agency settings/ai 404s when the plan lacks ask', async () => {
    for (const role of ['agency_admin', 'account_manager']) {
      viewer.mockResolvedValue({ viewer: { kind: 'user', userId: 'u1' }, ctx: ctxOf(role, ['ask']) });
      await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    }
    viewer.mockResolvedValue({ viewer: { kind: 'user', userId: 'u1' }, ctx: ctxOf('agency_admin', []) });
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('a plan with mcp but not ask still shows the page', async () => {
    viewer.mockResolvedValue({ viewer: { kind: 'user', userId: 'u1' }, ctx: ctxOf('agency_admin', ['mcp']) });
    render(await open());
    expect(screen.getByRole('heading', { level: 1, name: 'AI connections' })).toBeTruthy();
    expect(callTool.mock.calls.map((c) => c[1]).sort()).toEqual(['list_api_tokens', 'list_oauth_grants']);
  });
});

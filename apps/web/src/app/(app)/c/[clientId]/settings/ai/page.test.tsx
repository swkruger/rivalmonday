// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const viewer = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => viewer() }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.test' }) }));
vi.mock('@/components/ai-connections', () => ({ AccessTokensCard: () => null, ConnectedAppsCard: () => null, ConnectorUrlCard: () => null }));
vi.mock('./actions', () => ({ createClientTokenAction: vi.fn(), revokeClientGrantAction: vi.fn(), revokeClientTokenAction: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import AiConnectionsPage from './page';

const ctxOf = (role: string, features: string[]) => ({ role, agencyId: 'a1', clientScope: ['c1'], features: new Set(features) });
const open = () => AiConnectionsPage({ params: Promise.resolve({ clientId: 'c1' }) });

afterEach(cleanup);
describe('AiConnectionsPage (client)', () => {
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation(async (_ctx: unknown, name: string) => (name === 'get_client_profile' ? { name: 'A1 HVAC' } : { items: [] }));
  });

  it('a guest (signed-link contact) gets 404 before any tool call, even with the mcp feature', async () => {
    viewer.mockResolvedValue({ viewer: { kind: 'guest', contactId: 'k1' }, ctx: ctxOf('client_viewer', ['mcp']) });
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('a client role without the mcp feature gets 404 before any tool call', async () => {
    viewer.mockResolvedValue({ viewer: { kind: 'user', userId: 'u1' }, ctx: ctxOf('client_owner', []) });
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('a signed-in client owner with the mcp feature sees the page', async () => {
    viewer.mockResolvedValue({ viewer: { kind: 'user', userId: 'u1' }, ctx: ctxOf('client_owner', ['mcp']) });
    render(await open());
    expect(screen.getByRole('heading', { name: 'AI connections' })).toBeTruthy();
    expect(callTool.mock.calls.map((c) => c[1]).sort()).toEqual(['get_client_profile', 'list_api_tokens', 'list_oauth_grants']);
  });
});

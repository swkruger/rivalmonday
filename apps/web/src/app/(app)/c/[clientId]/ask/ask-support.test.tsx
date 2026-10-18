// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const C = '44444444-4444-4444-8444-444444444444';
const m = vi.hoisted(() => ({ callTool: vi.fn(), features: ['ask'] as string[] }));
vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({
    viewer: { kind: 'support', userId: 'op', session: { agencyId: 'ag' } },
    ctx: { agencyId: 'ag', userId: 'op', role: 'agency_admin', clientScope: 'all', features: m.features, support: { sessionId: 's', platformUserId: 'op' } },
  }),
}));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Friday' }));
vi.mock('@cs/mcp', () => ({ displayNameFor: async () => 'Acme Agency' }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasFeature: (ctx: { features: string[] }, f: string) => ctx.features.includes(f) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('./actions', () => ({ confirmAskAction: vi.fn(), deleteAskThreadAction: vi.fn(), saveAskRecommendation: vi.fn() }));
vi.mock('@/components/ask/ask-chat', () => ({ AskChat: () => null }));
vi.mock('@/components/ask/thread-list', () => ({ ThreadDrawer: () => null, ThreadList: () => null }));
const { default: AskPagePage } = await import('./page');
const { default: AskThreadPagePage } = await import('./[threadId]/page');

// The pages return `<AskScreen …/>`; run that async server component to get its markup.
type El = { type: (p: unknown) => Promise<React.ReactElement>; props: unknown };
const AskPage = async (a: Parameters<typeof AskPagePage>[0]) => { const el = (await AskPagePage(a)) as unknown as El; return el.type(el.props); };
const AskThreadPage = async (a: Parameters<typeof AskThreadPagePage>[0]) => { const el = (await AskThreadPagePage(a)) as unknown as El; return el.type(el.props); };

beforeEach(() => {
  m.features = ['ask'];
  m.callTool.mockReset();
  m.callTool.mockResolvedValue({});
});

describe('Ask in a support session', () => {
  it('shows the private-conversations copy instead of 404ing, and loads no thread tools', async () => {
    render(await AskPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Ask conversations are private to their authors.')).toBeTruthy();
    const tools = m.callTool.mock.calls.map((c) => c[1]);
    expect(tools).toEqual(['get_client_profile']);
    expect(m.callTool.mock.calls[0]![2]).toEqual({ clientId: C });
  });

  it('a thread URL shows the same copy without reading the thread', async () => {
    render(await AskThreadPage({ params: Promise.resolve({ clientId: C, threadId: 't1' }) }));
    expect(screen.getByText('Ask conversations are private to their authors.')).toBeTruthy();
    expect(m.callTool.mock.calls.map((c) => c[1])).not.toContain('get_my_ask_thread');
  });

  it('still 404s when the client has no Ask feature', async () => {
    m.features = [];
    await expect(AskPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

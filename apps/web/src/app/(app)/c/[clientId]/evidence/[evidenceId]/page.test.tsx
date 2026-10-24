import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_owner', userId: 'u1' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => null }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasChannel: () => false, hasFeature: () => false, hasPermission: () => false }));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }));
vi.mock('@/components/ask/save-recommendation-dialog', () => ({ RATIONALE_MAX: 10, TITLE_MAX: 10, SaveRecommendationDialog: () => null }));
vi.mock('../../ask/actions', () => ({ saveAskRecommendation: vi.fn() }));

const { default: EvidencePage } = await import('./page');

const C = '00000000-0000-4000-8000-0000000000c1';
const evidence = (channel: string) => ({
  channel, channelLabel: channel, competitorName: 'Smith', capturedAt: '2026-10-21T14:00:00Z', captureStatus: 'ok', kind: 'text', url: null,
  sha256: 'x', legalHold: false, citedBy: [], captureId: 'cap1',
});
const mount = (channel: string) =>
  callTool.mockImplementation(async (_c: unknown, name: string) => (name === 'get_client_profile' ? { name: 'Cool Air', timezone: 'UTC' } : evidence(channel)));

/** Depth-first search of a React element tree (not rendered: the compare body is an async server component). */
function hasId(node: unknown, id: string): boolean {
  if (Array.isArray(node)) return node.some((n) => hasId(n, id));
  if (!node || typeof node !== 'object') return false;
  const props = (node as { props?: Record<string, unknown> }).props;
  return !!props && (props.id === id || hasId(props.children, id));
}

describe('Evidence page "Compare with previous"', () => {
  it('section only for web evidence', async () => {
    mount('web');
    expect(hasId(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }), 'compare-previous-heading')).toBe(true);
    mount('google_ads');
    expect(hasId(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }), 'compare-previous-heading')).toBe(false);
  });
});

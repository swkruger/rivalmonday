// Launch-gate 6c: the assistant's name starts with the page's other reads; refusals still 404.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.fn();
const m = vi.hoisted(() => ({ ask: true }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_admin', userId: 'u1', agencyId: 'a1' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => calls(...a), tryCallTool: (...a: unknown[]) => calls(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => calls(null, 'help', ...a) }));
vi.mock('@/server/ask', () => ({ assistantNameFor: (...a: unknown[]) => calls(null, 'assistant_name', ...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasChannel: () => m.ask, hasFeature: () => true, hasPermission: () => true }));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }));
vi.mock('@/components/ask/save-recommendation-dialog', () => ({ SaveRecommendationDialog: () => null }));
vi.mock('../../ask/actions', () => ({ saveAskRecommendation: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

const { default: EvidencePage } = await import('./page');

const visit = () => EvidencePage({ params: Promise.resolve({ clientId: 'c', evidenceId: 'e' }) });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EvidencePage reads (launch-gate 6c)', () => {
  beforeEach(() => {
    m.ask = true;
    calls.mockReset();
    calls.mockImplementation(() => new Promise(() => {}));
  });

  it('the assistant name starts beside the evidence, the profile and the guides', async () => {
    void visit();
    await flush();
    expect(calls.mock.calls.map((c) => c[1])).toEqual(['get_evidence', 'get_client_profile', 'help', 'assistant_name']);
  });

  it('without Ask the assistant name is never read', async () => {
    m.ask = false;
    void visit();
    await flush();
    expect(calls.mock.calls.map((c) => c[1])).toEqual(['get_evidence', 'get_client_profile', 'help']);
  });

  it('out-of-scope evidence still 404s, with no unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    calls.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    const err = await visit().then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

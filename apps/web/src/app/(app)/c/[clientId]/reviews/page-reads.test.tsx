// Launch-gate 6a: the review search waits for the benchmark only when a topic must be checked; refusals still 404.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a), registry: vi.fn() }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => callTool(null, 'help', ...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ReviewsPage from './page';

const visit = (sp: Record<string, string> = {}) => ReviewsPage({ params: Promise.resolve({ clientId: 'c' }), searchParams: Promise.resolve(sp) });
const flush = () => new Promise((r) => setTimeout(r, 0));
const search = () => callTool.mock.calls.find((c) => c[1] === 'search_reviews');

describe('ReviewsPage reads (launch-gate 6a)', () => {
  let releaseBenchmark: (v: unknown) => void = () => {};
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation((_c: unknown, name: string) => {
      if (name === 'get_topic_benchmark') return new Promise((r) => { releaseBenchmark = r; });
      return new Promise(() => {});
    });
  });

  it('without a topic the search starts beside the benchmark', async () => {
    void visit({ stars: '4' });
    await flush();
    expect(search()?.[2]).toEqual({ clientId: 'c', stars: 4, days: 90, offset: 0 });
  });

  it('with a topic the search waits for the benchmark and keeps only a known topic', async () => {
    void visit({ topic: 'pricing' });
    await flush();
    expect(search()).toBeUndefined();
    releaseBenchmark({ topics: [{ id: 'pricing', name: 'Pricing' }] });
    await flush();
    expect(search()?.[2]).toEqual({ clientId: 'c', topicId: 'pricing', days: 90, offset: 0 });
  });

  it('an out-of-scope client still 404s, with no unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    for (const sp of [{}, { topic: 'pricing' }] as Record<string, string>[]) {
      const err = await visit(sp).then(() => null, (e: unknown) => e);
      expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    }
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

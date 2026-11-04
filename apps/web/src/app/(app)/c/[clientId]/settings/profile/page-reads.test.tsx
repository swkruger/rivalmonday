// Launch-gate 6b: the staff reads start with the profile (billing waits only for its status); refusals still 404.
import { createAccessContext } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const callTool = vi.fn();
const admin = createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: ['dashboard'] as never });
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: admin }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), registry: vi.fn() }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [] }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('./actions', () => ({ saveFeaturesAction: vi.fn(), updateProfileAction: vi.fn(), updateDetailsAction: vi.fn() }));

const { default: Page } = await import('./page');
const visit = () => Page({ params: Promise.resolve({ clientId: C }) });
const flush = () => new Promise((r) => setTimeout(r, 0));
const called = () => callTool.mock.calls.map((c) => c[1]);

describe('client profile page reads (launch-gate 6b)', () => {
  let releaseProfile: (v: unknown) => void = () => {};
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation((_c: unknown, name: string) => {
      if (name === 'get_client_profile') return new Promise((r) => { releaseProfile = r; });
      return new Promise(() => {});
    });
  });

  it('the Ask-review and details reads start beside the profile; billing waits for an active profile', async () => {
    void visit();
    await flush();
    expect(called()).toEqual(['get_client_profile', 'get_ask_starters', 'get_client_details']);
    releaseProfile({ status: 'active' });
    await flush();
    expect(called()).toContain('list_client_billing_status');
  });

  it('a prospect never reads the billing rows', async () => {
    void visit();
    await flush();
    releaseProfile({ status: 'prospect' });
    await flush();
    expect(called()).not.toContain('list_client_billing_status');
  });

  it('an out-of-scope client still 404s, with no unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    const err = await visit().then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

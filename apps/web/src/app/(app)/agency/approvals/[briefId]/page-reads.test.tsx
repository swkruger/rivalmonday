// Launch-gate 6b: the agency help guides start beside the brief read (after the role check); refusals still 404.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'agency_admin' }));
const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: state.role, features: new Set() } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => callTool(null, 'help', ...a) }));
vi.mock('@/server/evidence-refs', () => ({ evidenceRefsFor: async () => new Map() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('./actions', () => ({}));

const { default: Page } = await import('./page');
const visit = () => Page({ params: Promise.resolve({ briefId: 'b' }) });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ApprovalReviewPage reads (launch-gate 6b)', () => {
  beforeEach(() => {
    state.role = 'agency_admin';
    callTool.mockReset();
    callTool.mockImplementation(() => new Promise(() => {}));
  });

  it('the help guides start beside get_brief_review', async () => {
    void visit();
    await flush();
    expect(callTool.mock.calls.map((c) => c[1]).sort()).toEqual(['get_brief_review', 'help']);
  });

  it('a client role 404s before any read', async () => {
    state.role = 'client_owner';
    const err = await visit().then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('an unknown or out-of-scope brief still 404s, with no unhandled rejections', async () => {
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

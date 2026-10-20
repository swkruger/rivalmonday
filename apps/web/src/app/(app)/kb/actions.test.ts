import { createAccessContext } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ run: vi.fn(), viewer: null as unknown, operator: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer, requireOperatorContext: m.operator }));
vi.mock('@/server/run-tool', () => ({ runTool: m.run }));
const { loadPageGuide } = await import('./actions');

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000c1';
const GUIDE = { id: 'g', title: 'T', sections: [] };
const view = (kind: 'user' | 'support', features: 'ask'[] = ['ask'], role: 'agency_admin' | 'client_owner' = 'agency_admin') => {
  const ctx = createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role === 'agency_admin' ? 'all' : [C], features });
  m.viewer = { viewer: { kind, ctx }, ctx };
  return ctx;
};
beforeEach(() => { m.run.mockReset(); m.operator.mockReset(); });

describe('loadPageGuide', () => {
  it('reads get_page_guide and reports canAsk from the Ask feature', async () => {
    view('user');
    m.run.mockResolvedValue({ ok: true, data: GUIDE });
    expect(await loadPageGuide('page:overview', 'client', C)).toEqual({ guide: GUIDE, canAsk: true });
    expect(m.run).toHaveBeenCalledWith(expect.anything(), 'get_page_guide', { helpKey: 'page:overview', context: 'client', clientId: C });
  });
  it('canAsk is false without the feature and in a support session; a refusal is guide null', async () => {
    view('user', [], 'client_owner');
    m.run.mockResolvedValue({ ok: false, error: 'Not found' });
    expect(await loadPageGuide('page:overview', 'agency')).toEqual({ guide: null, canAsk: false });
    view('support');
    m.run.mockResolvedValue({ ok: true, data: GUIDE });
    expect((await loadPageGuide('page:overview', 'client', C)).canAsk).toBe(false);
  });
  it('uses the operator context for platform and rejects a malformed client id without a read', async () => {
    const ctx = view('user');
    m.operator.mockResolvedValue({ viewer: { kind: 'user', ctx }, ctx });
    m.run.mockResolvedValue({ ok: true, data: GUIDE });
    await loadPageGuide('page:x', 'platform');
    expect(m.operator).toHaveBeenCalled();
    m.run.mockClear();
    expect(await loadPageGuide('page:x', 'client', 'nope')).toEqual({ guide: null, canAsk: false });
    expect(m.run).not.toHaveBeenCalled();
  });
});

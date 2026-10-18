import { createAccessContext } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Impl = (ctx: unknown, tool: string, input: unknown) => Promise<unknown>;
const m = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (async () => ({})) as Impl, noRegistry: false }));
vi.mock('./tools', () => ({
  registry: () => {
    if (m.noRegistry) throw new Error('registry unavailable');
    return {
      invoke: (...a: [unknown, string, unknown]) => {
        m.calls.push(a);
        return m.impl(...a);
      },
    };
  },
}));

import { navCounts } from './nav';

const ctx = createAccessContext({ agencyId: '00000000-0000-4000-8000-00000000000a', userId: 'u', role: 'agency_admin', clientScope: 'all', features: [] });
const agencyCounts = { approvals: 3, alerts: 2, leads: 4 };
const platformCounts = { modelReviews: 5, themes: 1 };
const catalogCounts = { count: 2 };
const byTool: Impl = async (_c, tool) =>
  tool === 'get_nav_counts' ? agencyCounts : tool === 'get_platform_nav_counts' ? platformCounts : tool === 'count_catalog_review' ? catalogCounts : Promise.reject(new Error(`unexpected ${tool}`));

beforeEach(() => {
  m.calls = [];
  m.impl = byTool;
  m.noRegistry = false;
});

describe('navCounts', () => {
  it('reads each count tool once and merges them', async () => {
    expect(await navCounts(ctx, { agency: true, operator: true, leads: true })).toEqual({ ...agencyCounts, ...platformCounts, catalog: 2 });
    expect(m.calls).toEqual([[ctx, 'get_nav_counts', {}], [ctx, 'get_platform_nav_counts', {}], [ctx, 'count_catalog_review', {}]]);
  });

  it('leaves out the leads count unless the viewer sees the Leads entry', async () => {
    expect(await navCounts(ctx, { agency: true, operator: false, leads: false })).toEqual({ approvals: 3, alerts: 2 });
    expect(m.calls.map((c) => c[1])).toEqual(['get_nav_counts']);
  });

  it('skips the agency read for non-agency viewers and the platform read for non-operators', async () => {
    expect(await navCounts(ctx, { agency: false, operator: false, leads: false })).toEqual({});
    expect(m.calls).toEqual([]);
    expect(await navCounts(ctx, { agency: false, operator: true, leads: false })).toEqual({ ...platformCounts, catalog: 2 });
  });

  it('returns {} when the tools throw (the shell must still render)', async () => {
    m.impl = async () => {
      throw new Error('boom');
    };
    expect(await navCounts(ctx, { agency: true, operator: true, leads: true })).toEqual({});
  });

  it('returns {} when the registry itself cannot be built', async () => {
    m.noRegistry = true;
    expect(await navCounts(ctx, { agency: true, operator: true, leads: true })).toEqual({});
  });

  it('a failed read omits only its own badges', async () => {
    m.impl = async (c, tool, i) => (tool === 'get_platform_nav_counts' ? Promise.reject(new Error('down')) : byTool(c, tool, i));
    expect(await navCounts(ctx, { agency: true, operator: true, leads: true })).toEqual({ ...agencyCounts, catalog: 2 });
  });

  it('Phase 14a: the Business types count comes from the catalogue review read; a failed read hides only that badge', async () => {
    m.impl = async (c, tool, i) => (tool === 'count_catalog_review' ? Promise.reject(new Error('permission_denied')) : byTool(c, tool, i));
    expect(await navCounts(ctx, { agency: false, operator: true, leads: false })).toEqual(platformCounts);
  });
});

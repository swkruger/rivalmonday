import { createAccessContext } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ calls: [] as unknown[][], impl: async (..._a: unknown[]): Promise<unknown> => ({ leads: [] }) }));
vi.mock('./tools', () => ({
  registry: () => ({
    invoke: (...a: unknown[]) => {
      m.calls.push(a);
      return m.impl(...a);
    },
  }),
}));

import { newLeadsCount } from './nav';

const ctx = createAccessContext({ agencyId: '00000000-0000-4000-8000-00000000000a', userId: 'u', role: 'agency_admin', clientScope: 'all', features: [] });

describe('newLeadsCount', () => {
  it('counts the verified leads list_leads returns', async () => {
    m.impl = async () => ({ leads: [{}, {}, {}] });
    expect(await newLeadsCount(ctx)).toBe(3);
    expect(m.calls.at(-1)).toEqual([ctx, 'list_leads', { status: 'verified' }]);
  });

  it('is 0 when the read fails (the shell must still render)', async () => {
    m.impl = async () => {
      throw new Error('boom');
    };
    expect(await newLeadsCount(ctx)).toBe(0);
  });
});

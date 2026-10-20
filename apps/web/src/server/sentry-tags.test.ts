import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTags = vi.fn();
vi.mock('@sentry/nextjs', () => ({ getIsolationScope: () => ({ setTags }) }));
const hdrs = vi.fn();
vi.mock('next/headers', () => ({ headers: () => hdrs() }));

import { tagRequest } from './sentry-tags';

const ctx = (over: object = {}) => ({ agencyId: 'ag1', userId: 'u1', role: 'agency_admin', clientScope: 'all', features: new Set(), ...over }) as never;

describe('tagRequest', () => {
  beforeEach(() => { setTags.mockReset(); hdrs.mockReset(); hdrs.mockResolvedValue(new Headers({ 'x-vercel-id': 'iad1::r1' })); });
  it('sets only id tags', async () => {
    await tagRequest(ctx(), { clientId: 'cl1', email: 'a@b.co', prompt: 'x' });
    expect(setTags).toHaveBeenCalledWith({ agencyId: 'ag1', clientId: 'cl1', requestId: 'iad1::r1' });
  });
  it('skips an unknown client and uses a single-client scope', async () => {
    await tagRequest(ctx(), {});
    expect(setTags.mock.calls[0]![0]).not.toHaveProperty('clientId');
    await tagRequest(ctx({ clientScope: ['only'] }), null);
    expect(setTags.mock.calls[1]![0].clientId).toBe('only');
  });
  it('never throws outside a request', async () => {
    hdrs.mockRejectedValue(new Error('no request scope'));
    await expect(tagRequest(ctx(), {})).resolves.toBeUndefined();
    expect(setTags).not.toHaveBeenCalled();
  });
});

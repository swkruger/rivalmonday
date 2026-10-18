import { beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 14a: the options come from the DB catalogue (`catalogOf(deps).list()`, which owns the TTL cache and never caches a failed read).
const list = vi.fn();
vi.mock('@cs/tools', () => ({ catalogOf: () => ({ list }) }));
vi.mock('./tools', () => ({ toolDeps: () => ({}) }));

beforeEach(() => {
  list.mockReset();
});

const vertical = { id: 'hvac', name: 'HVAC', services: [{ id: 'ac_tune_up', name: 'AC tune-up', extra: 1 }], extra: true };

describe('verticalOptions', () => {
  it('maps the catalogue list to id, name and service id/name', async () => {
    list.mockResolvedValue([vertical]);
    const { verticalOptions } = await import('./verticals');
    expect(await verticalOptions()).toEqual([{ id: 'hvac', name: 'HVAC', services: [{ id: 'ac_tune_up', name: 'AC tune-up' }] }]);
  });

  it('does not cache a failed read: the next call retries', async () => {
    list.mockRejectedValueOnce(new Error('EMFILE')).mockResolvedValue([vertical]);
    const { verticalOptions } = await import('./verticals');
    await expect(verticalOptions()).rejects.toThrow('EMFILE');
    expect((await verticalOptions()).map((v) => v.id)).toEqual(['hvac']);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

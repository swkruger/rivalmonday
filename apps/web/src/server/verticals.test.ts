import { beforeEach, describe, expect, it, vi } from 'vitest';

const listVerticalPacks = vi.fn();
const loadVerticalPack = vi.fn();
vi.mock('@cs/verticals', () => ({ listVerticalPacks, loadVerticalPack }));

beforeEach(() => {
  vi.resetModules();
  listVerticalPacks.mockReset();
  loadVerticalPack.mockReset();
});

const pack = { id: 'hvac', name: 'HVAC', services: [{ id: 'ac_tune_up', name: 'AC tune-up', extra: 1 }] };

describe('verticalOptions', () => {
  it('reads the packs once per process', async () => {
    listVerticalPacks.mockResolvedValue(['hvac']);
    loadVerticalPack.mockResolvedValue(pack);
    const { verticalOptions } = await import('./verticals');
    expect(await verticalOptions()).toEqual([{ id: 'hvac', name: 'HVAC', services: [{ id: 'ac_tune_up', name: 'AC tune-up' }] }]);
    await verticalOptions();
    expect(listVerticalPacks).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read: the next call retries', async () => {
    listVerticalPacks.mockRejectedValueOnce(new Error('EMFILE')).mockResolvedValue(['hvac']);
    loadVerticalPack.mockResolvedValue(pack);
    const { verticalOptions } = await import('./verticals');
    await expect(verticalOptions()).rejects.toThrow('EMFILE');
    expect((await verticalOptions()).map((v) => v.id)).toEqual(['hvac']);
    expect(listVerticalPacks).toHaveBeenCalledTimes(2);
  });
});

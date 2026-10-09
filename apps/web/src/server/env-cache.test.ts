import type { EnvName } from '@cs/db';
import { describe, expect, it, vi } from 'vitest';
import { clearEnvCaches, perEnv } from './env-cache';

describe('perEnv', () => {
  it('builds one value per environment and reuses it after switching back', () => {
    let current: EnvName = 'dev';
    const build = vi.fn((name: EnvName) => ({ name }));
    const get = perEnv(build, undefined, () => current);
    const dev = get();
    expect(get()).toBe(dev);
    current = 'demo';
    const demo = get();
    expect(demo).not.toBe(dev);
    expect(demo.name).toBe('demo');
    current = 'dev';
    expect(get()).toBe(dev);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('clearEnvCaches disposes every cached value and rebuilds on next use', async () => {
    const dispose = vi.fn();
    const get = perEnv((name: EnvName) => ({ name }), dispose, () => 'demo');
    const first = get();
    await clearEnvCaches();
    expect(dispose).toHaveBeenCalledWith(first);
    expect(get()).not.toBe(first);
  });
});

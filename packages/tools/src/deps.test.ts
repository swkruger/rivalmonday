import { describe, expect, it } from 'vitest';
import { enqueueOf, packsOf, type ToolDeps } from './deps';

const base = { app: {} as ToolDeps['app'], service: {} as ToolDeps['service'] };

describe('tool deps', () => {
  it('defaults the pack loader to the bundled packs', async () => {
    const pack = await packsOf(base)('hvac_plumbing');
    expect(pack.id).toBe('hvac_plumbing');
  });

  it('refuses background work when no queue is wired', () => {
    expect(() => enqueueOf(base)).toThrow(expect.objectContaining({ code: 'internal' }));
    const enqueue = async () => {};
    expect(enqueueOf({ ...base, enqueue })).toBe(enqueue);
  });
});

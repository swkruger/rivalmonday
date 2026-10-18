import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hitRate } from './rate';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
});

const at = (iso: string) => new Date(iso);

describe('hitRate', () => {
  it('allows up to the limit and refuses the next', async () => {
    const now = at('2026-10-17T10:15:00Z');
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) results.push(await hitRate(dbs.service, 'ip:a', 'hour', 5, now));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('new window resets', async () => {
    const h1 = at('2026-10-17T10:15:00Z');
    for (let i = 0; i < 5; i++) await hitRate(dbs.service, 'ip:b', 'hour', 5, h1);
    expect(await hitRate(dbs.service, 'ip:b', 'hour', 5, h1)).toBe(false);
    expect(await hitRate(dbs.service, 'ip:b', 'hour', 5, at('2026-10-17T11:00:00Z'))).toBe(true);

    const d1 = at('2026-10-17T23:59:00Z');
    for (let i = 0; i < 2; i++) await hitRate(dbs.service, 'link:c', 'day', 2, d1);
    expect(await hitRate(dbs.service, 'link:c', 'day', 2, d1)).toBe(false);
    expect(await hitRate(dbs.service, 'link:c', 'day', 2, at('2026-10-18T00:00:00Z'))).toBe(true);
  });

  it('20 parallel hits with limit 5 allow exactly 5', async () => {
    const now = at('2026-10-17T10:15:00Z');
    const results = await Promise.all(Array.from({ length: 20 }, () => hitRate(dbs.service, 'ip:parallel', 'hour', 5, now)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.filter((r) => !r)).toHaveLength(15);
  });

  it('keys are independent', async () => {
    const now = at('2026-10-17T10:15:00Z');
    for (let i = 0; i < 5; i++) await hitRate(dbs.service, 'ip:x', 'hour', 5, now);
    expect(await hitRate(dbs.service, 'ip:y', 'hour', 5, now)).toBe(true);
  });
});

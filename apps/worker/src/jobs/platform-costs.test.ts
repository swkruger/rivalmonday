import { platformCostSnapshot } from '@cs/db';
import { openTestDbs, seedPlatformCostServices, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createPlatformCostsJobs } from './platform-costs';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedPlatformCostServices(dbs.owner);
});

describe('platform-costs-snapshot', () => {
  it('declares name, 06:00 UTC cron, short queue and payload schema', () => {
    const { snapshot } = createPlatformCostsJobs({} as WorkerDeps);
    expect(snapshot).toMatchObject({ name: 'platform-costs-snapshot', cron: '0 6 * * *', queue: { policy: 'short', expireInSeconds: 600, retryLimit: 1 } });
    expect(snapshot.schema.safeParse({}).success).toBe(true);
  });

  it('job handler calls snapshotAll and returns statuses', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { total_credits: 20, total_usage: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const deps = {
      platformCosts: () => ({ service: dbs.service, env: { OPENROUTER_API_KEY: 'k' }, fetchImpl, platformAdmins: [], appUrl: 'https://app.example', sendLowEmail: async () => {} }),
    } as unknown as WorkerDeps;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await createPlatformCostsJobs(deps).snapshot.handler({});
    log.mockRestore();
    expect(out).toEqual({
      statuses: { openrouter: 'ok', dataforseo: 'not_configured', scrapecreators: 'not_configured', apify: 'not_configured', anthropic: 'not_configured', neon: 'not_configured' },
    });
    expect(await dbs.owner.select().from(platformCostSnapshot)).toHaveLength(1);
  });
});

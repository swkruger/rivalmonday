import { platformSetting } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLE_LIMIT, pilotMode, sampleAgencyId, sampleBriefMonthlyLimit } from './settings';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
});

describe('pilot settings', () => {
  it('pilotMode missing row = false', async () => {
    expect(await pilotMode(dbs.service)).toBe(false);
  });
  it('pilotMode reads the stored switch', async () => {
    await dbs.service.insert(platformSetting).values({ key: 'pilot_mode', value: { on: true }, updatedBy: 't' });
    expect(await pilotMode(dbs.service)).toBe(true);
  });
  it('limit default 10', async () => {
    expect(DEFAULT_SAMPLE_LIMIT).toBe(10);
    expect(await sampleBriefMonthlyLimit(dbs.service)).toBe(10);
  });
  it('limit reads the stored number, including 0', async () => {
    await dbs.service.insert(platformSetting).values({ key: 'sample_brief_monthly_limit', value: { n: 0 }, updatedBy: 't' });
    expect(await sampleBriefMonthlyLimit(dbs.service)).toBe(0);
  });
  it('sampleAgencyId is null until written', async () => {
    expect(await sampleAgencyId(dbs.service)).toBeNull();
    await dbs.service.insert(platformSetting).values({ key: 'sample_agency_id', value: { agencyId: 'a-1' }, updatedBy: 't' });
    expect(await sampleAgencyId(dbs.service)).toBe('a-1');
  });
});

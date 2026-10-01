import { observation, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { collectReadyJobs, employerMatches } from './collect';
import { postJobTasks } from './post';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('jobs', () => {
  it('matches employers loosely', () => {
    expect(employerMatches('Smith HVAC, LLC', 'Smith HVAC')).toBe(true);
    expect(employerMatches('smith hvac and plumbing inc', 'Smith HVAC')).toBe(true);
    expect(employerMatches('Jones Heating', 'Smith HVAC')).toBe(false);
    expect(employerMatches(null, 'Smith HVAC')).toBe(false);
  });

  it('never matches a very short normalised name by substring, only by equality', () => {
    expect(employerMatches('ACE Hardware', 'AC')).toBe(false);
    expect(employerMatches('AC', 'AC')).toBe(true);
  });

  it('matches whole words only, not cross-word substrings', () => {
    expect(employerMatches('Walmart Van Furniture Movers', 'Art Van Furniture')).toBe(false);
    expect(employerMatches('Art Van Furniture, Inc.', 'Art Van Furniture')).toBe(true);
    expect(employerMatches('Smith & Sons Plumbing', 'Smith and Sons Plumbing')).toBe(true);
  });

  it('skips competitors with a blank name when posting', async () => {
    const dfsPost = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100 })]);
    expect(
      await postJobTasks({ db: dbs.service, dfs: dfsPost }, [
        { id: IDS.competitorX, name: 'Smith HVAC' },
        { id: IDS.competitorY, name: '   ' },
      ]),
    ).toEqual({ posted: 1 });
    expect(dfsPost.calls[0]?.body).toEqual([{ keyword: 'Smith HVAC', location_code: 2840, language_code: 'en', depth: 20, tag: IDS.competitorX }]);
  });

  it('posts, collects matching postings as observations', async () => {
    const dfsPost = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100 })]);
    expect(await postJobTasks({ db: dbs.service, dfs: dfsPost }, [{ id: IDS.competitorX, name: 'Smith HVAC' }])).toEqual({ posted: 1 });
    expect(dfsPost.calls[0]?.body).toEqual([{ keyword: 'Smith HVAC', location_code: 2840, language_code: 'en', depth: 20, tag: IDS.competitorX }]);

    const dfs = fakeDfs((_m, path) =>
      path.endsWith('/tasks_ready')
        ? [dfsTask([{ id: TASK }])]
        : [dfsTask([{ items: [
            { type: 'google_jobs_item', job_id: 'j1', title: 'HVAC Technician', employer_name: 'Smith HVAC LLC', location: 'Dunwoody, GA', source_url: 'https://jobs/1', salary: '$25–35/hr', contract_type: 'Full-time', timestamp: '2026-09-24 00:00:00 +00:00' },
            { type: 'google_jobs_item', job_id: 'j2', title: 'Cook', employer_name: 'Diner Co' },
          ] }], { id: TASK })],
    );
    const r = await collectReadyJobs({ db: dbs.service, store: createMemoryStore(), dfs });
    expect(r).toEqual({ collected: 1, failed: 0, postings: 1 });
    expect(dfs.calls[1]?.path).toBe(`/serp/google/jobs/task_get/advanced/${TASK}`);
    const obs = await dbs.service.select().from(observation);
    expect(obs.map((o) => [o.kind, o.key])).toEqual([['job_posting', 'j1']]);
    expect(obs[0]?.data).toMatchObject({ title: 'HVAC Technician', location: 'Dunwoody, GA', sourceUrl: 'https://jobs/1' });
    expect((await dbs.service.select().from(vendorTask))[0]?.status).toBe('done');
  });
});

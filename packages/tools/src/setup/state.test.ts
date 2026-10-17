import { client, clientSetup, competitorSuggestion, discoveryRun } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { completeIfDone, deriveSetupState, getSetupState, type SetupState } from './state';

const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const CLIENT = { keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJx', status: 'active' };
const SETUP = { skipped: [] as string[], competitorsDoneAt: null as Date | null, completedAt: null as Date | null, dismissedAt: null as Date | null };
const NOW = new Date('2026-10-16T12:00:00Z');
type In = Parameters<typeof deriveSetupState>[0];
const base = (o: Partial<In> = {}): In => ({ client: CLIENT, setup: SETUP, latestRun: null, hasPendingSuggestions: false, ...o });
const done = { status: 'done' };
type Steps = [string, string, string];

const rows: { name: string; input: In; steps: Steps; open: boolean; exists?: boolean; waitingOn: SetupState['waitingOn']; refusal?: string | null }[] = [
  { name: 'no row: closed, all done', input: base({ setup: null }), steps: ['done', 'done', 'done'], open: false, exists: false, waitingOn: null },
  { name: 'profile incomplete (no keywords)', input: base({ client: { ...CLIENT, keywords: [] } }), steps: ['todo', 'todo', 'todo'], open: true, waitingOn: 'agency' },
  { name: 'profile incomplete after place-id removal', input: base({ client: { ...CLIENT, placeId: null }, latestRun: done }), steps: ['todo', 'done', 'todo'], open: true, waitingOn: 'agency' },
  { name: 'profile incomplete (no service area)', input: base({ client: { ...CLIENT, serviceArea: null } }), steps: ['todo', 'todo', 'todo'], open: true, waitingOn: 'agency' },
  { name: 'profile done, no run -> search todo, agency', input: base(), steps: ['done', 'todo', 'todo'], open: true, waitingOn: 'agency' },
  { name: 'search queued -> running, system', input: base({ latestRun: { status: 'queued' } }), steps: ['done', 'running', 'todo'], open: true, waitingOn: 'system' },
  ...['searching', 'checking', 'finalising'].map((s) => ({ name: `search ${s} -> running`, input: base({ latestRun: { status: s } }), steps: ['done', 'running', 'todo'] as Steps, open: true, waitingOn: 'system' as const })),
  { name: 'search failed -> blocked with refusal', input: base({ latestRun: { status: 'failed', error: 'budget' } }), steps: ['done', 'blocked', 'todo'], open: true, waitingOn: 'agency', refusal: 'budget' },
  { name: 'search done, pending suggestions -> agency', input: base({ latestRun: done, hasPendingSuggestions: true }), steps: ['done', 'done', 'todo'], open: true, waitingOn: 'agency' },
  { name: 'search done, none pending, not confirmed -> todo, no one', input: base({ latestRun: done }), steps: ['done', 'done', 'todo'], open: true, waitingOn: null },
  { name: 'competitors confirmed, closed', input: base({ latestRun: done, setup: { ...SETUP, competitorsDoneAt: NOW, completedAt: NOW } }), steps: ['done', 'done', 'done'], open: false, waitingOn: null },
  { name: 'search skipped, competitors confirmed', input: base({ setup: { ...SETUP, skipped: ['search'], competitorsDoneAt: NOW } }), steps: ['done', 'skipped', 'done'], open: true, waitingOn: null },
  { name: 'all skipped (profile done), closed', input: base({ setup: { ...SETUP, skipped: ['search', 'competitors'], completedAt: NOW } }), steps: ['done', 'skipped', 'skipped'], open: false, waitingOn: null },
  { name: 'skipped search beats a failed run', input: base({ latestRun: { status: 'failed', error: 'x' }, setup: { ...SETUP, skipped: ['search'] } }), steps: ['done', 'skipped', 'todo'], open: true, waitingOn: null, refusal: null },
  { name: 'closed by dismissal', input: base({ setup: { ...SETUP, dismissedAt: NOW } }), steps: ['done', 'todo', 'todo'], open: false, waitingOn: null },
];

describe('deriveSetupState', () => {
  it.each(rows)('$name', ({ input, steps, open, exists, waitingOn, refusal }) => {
    const s = deriveSetupState(input);
    expect([s.steps.profile, s.steps.search, s.steps.competitors]).toEqual(steps);
    expect(s.open).toBe(open);
    expect(s.exists).toBe(exists ?? true);
    expect(s.waitingOn).toBe(waitingOn);
    expect(s.searchRefusal).toBe(refusal ?? null);
  });
  it('carries completedAt and dismissedAt', () => {
    const s = deriveSetupState(base({ setup: { ...SETUP, completedAt: NOW, dismissedAt: NOW } }));
    expect(s.completedAt).toEqual(NOW);
    expect(s.dismissedAt).toEqual(NOW);
  });
});

describe('getSetupState / completeIfDone', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });
  const insertSetup = (v: Partial<typeof clientSetup.$inferInsert> = {}) => dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, ...v });
  const profile = () => dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJx' }).where(eq(client.id, IDS.clientA1));

  it('no row reads as complete', async () => {
    expect(await getSetupState(dbs.service, IDS.clientA1)).toMatchObject({ exists: false, open: false });
  });

  it('pending suggestions are open suggestions of the latest done run', async () => {
    await profile();
    await insertSetup();
    const [run] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'done', finishedAt: new Date() }).returning({ id: discoveryRun.id });
    expect((await getSetupState(dbs.service, IDS.clientA1)).waitingOn).toBe(null);
    const sug = { agencyId: IDS.agencyA, clientId: IDS.clientA1, runId: run!.id, name: 'Rival', appearances: 1, overlapScore: 0.5 };
    await dbs.owner.insert(competitorSuggestion).values({ ...sug, status: 'dismissed' });
    expect((await getSetupState(dbs.service, IDS.clientA1)).waitingOn).toBe(null);
    await dbs.owner.insert(competitorSuggestion).values(sug);
    const s = await getSetupState(dbs.service, IDS.clientA1);
    expect(s.steps).toEqual({ profile: 'done', search: 'done', competitors: 'todo' });
    expect(s.waitingOn).toBe('agency');
  });

  it('completeIfDone is idempotent and never clears completed_at', async () => {
    await profile();
    await insertSetup({ skipped: ['search', 'competitors'] });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(true);
    expect(await completeIfDone(dbs.service, IDS.clientA1, new Date(NOW.getTime() + 1000))).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toEqual(NOW);
    await dbs.owner.update(client).set({ placeId: null }).where(eq(client.id, IDS.clientA1));
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toEqual(NOW);
  });

  it('completeIfDone leaves a dismissed row without completed_at', async () => {
    await profile();
    await insertSetup({ skipped: ['search', 'competitors'], dismissedAt: NOW });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toBeNull();
  });

  it('completeIfDone does nothing while a step is open', async () => {
    await profile();
    await insertSetup({ skipped: ['search'] });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toBeNull();
  });
});

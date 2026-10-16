import { agencyBilling, agencyOnboarding, client, clientCompetitor, competitor, trackedPage } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDuePages } from './due-pages';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { competitorId: IDS.competitorX, pageType: 'pricing', source: 'nav' };
  await dbs.service.insert(trackedPage).values([
    { ...base, url: 'https://s.example/due-daily', cadence: 'daily', nextDueAt: sql`now() - interval '1 minute'` },
    { ...base, url: 'https://s.example/due-weekly', cadence: 'weekly', nextDueAt: sql`now() - interval '1 hour'` },
    { ...base, url: 'https://s.example/future', cadence: 'daily', nextDueAt: sql`now() + interval '1 hour'` },
    { ...base, url: 'https://s.example/inactive', cadence: 'daily', active: false, nextDueAt: sql`now() - interval '1 hour'` },
  ]);
});

describe('claimDuePages', () => {
  it('claims only due active pages and advances their next_due_at by cadence', async () => {
    const claimed = await claimDuePages(dbs.service, 10);
    expect(claimed).toHaveLength(2);
    expect(await claimDuePages(dbs.service, 10)).toEqual([]);
    const rows = (await dbs.service.execute(sql`
      SELECT url, round(extract(epoch FROM (next_due_at - now())) / 3600) AS hours FROM tracked_page
       WHERE id = ANY(ARRAY[${sql.join(claimed.map((id) => sql`${id}`), sql`, `)}]::uuid[]) ORDER BY url`)) as unknown as { url: string; hours: string }[];
    expect(rows.map((r) => [r.url, Number(r.hours)])).toEqual([
      ['https://s.example/due-daily', 24],
      ['https://s.example/due-weekly', 168],
    ]);
  });

  it('never hands the same page to concurrent claimers', async () => {
    const [a, b] = await Promise.all([claimDuePages(dbs.service, 10), claimDuePages(dbs.service, 10)]);
    expect([...a, ...b].sort()).toHaveLength(2);
    expect(new Set([...a, ...b]).size).toBe(2);
  });

  it('respects the limit', async () => {
    expect(await claimDuePages(dbs.service, 1)).toHaveLength(1);
  });

  it('never claims pages of a competitor nobody tracks', async () => {
    const [t] = await dbs.owner.insert(competitor).values({ name: 'Tracked Co' }).returning();
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: t!.id });
    const [u] = await dbs.owner.insert(competitor).values({ name: 'Untracked Co' }).returning();
    const [pageOfT] = await dbs.service
      .insert(trackedPage)
      .values({ competitorId: t!.id, url: 'https://t.example/page', pageType: 'pricing', source: 'nav', cadence: 'daily', nextDueAt: sql`now() - interval '1 minute'` })
      .returning({ id: trackedPage.id });
    const [pageOfU] = await dbs.service
      .insert(trackedPage)
      .values({ competitorId: u!.id, url: 'https://u.example/page', pageType: 'pricing', source: 'nav', cadence: 'daily', nextDueAt: sql`now() - interval '1 minute'` })
      .returning({ id: trackedPage.id });
    const claimed = await claimDuePages(dbs.service, 100);
    expect(claimed).toContain(pageOfT!.id);
    expect(claimed).not.toContain(pageOfU!.id);
  });

  it('skips pages of competitors only prospects track; a competitor an active client shares still runs (5b-2 decision 9)', async () => {
    // A2 (the only client tracking Y) is a prospect; B1 is a prospect too, but X is still tracked by active A1.
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientB1));
    const [x] = await dbs.service
      .insert(trackedPage)
      .values({ competitorId: IDS.competitorX, url: 'https://smithhvac.example/', pageType: 'home', source: 'nav', cadence: 'daily' })
      .returning({ id: trackedPage.id });
    const [yPage] = await dbs.service
      .insert(trackedPage)
      .values({ competitorId: IDS.competitorY, url: 'https://brightsmiles.example/', pageType: 'home', source: 'nav', cadence: 'daily' })
      .returning({ id: trackedPage.id });
    const claimed = await claimDuePages(dbs.service, 10);
    expect(claimed).toContain(x!.id);
    expect(claimed).not.toContain(yPage!.id);
    await dbs.owner.update(client).set({ status: 'active' }).where(eq(client.id, IDS.clientA2));
    expect(await claimDuePages(dbs.service, 10)).toEqual([yPage!.id]);
  });
});

describe('claimDuePages and billing state (9a)', () => {
  it('claims nothing when every agency tracking the competitor is read_only; one serviceable agency (or no billing row) keeps it claimable', async () => {
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect(await claimDuePages(dbs.service, 10)).toHaveLength(2); // agency B (no billing row) still tracks X via clientB1
    await dbs.service.update(trackedPage).set({ nextDueAt: sql`now() - interval '1 minute'` });
    await pauseAgency(dbs.owner, IDS.agencyB, 'suspended');
    expect(await claimDuePages(dbs.service, 10)).toEqual([]);
  });
});

describe('claimDuePages and a paused client (9b)', () => {
  it('claims nothing once every client tracking the competitor is paused', async () => {
    expect((await claimDuePages(dbs.service, 10)).length).toBeGreaterThan(0);
    await dbs.service.update(trackedPage).set({ nextDueAt: sql`now() - interval '1 minute'` });
    for (const id of [IDS.clientA1, IDS.clientA2, IDS.clientB1]) await pauseClient(dbs.owner, id);
    expect(await claimDuePages(dbs.service, 10)).toEqual([]);
  });
});

describe('claimDuePages and the reduced trial allowance (phase 10 f12)', () => {
  const reduce = async (agencyId: string) => {
    await dbs.owner.insert(agencyBilling).values({ agencyId, state: 'trialing' });
    await dbs.owner.insert(agencyOnboarding).values({ agencyId, source: 'open' });
  };
  const hoursUntilDue = async (id: string) => {
    const [r] = (await dbs.service.execute(sql`SELECT round(extract(epoch FROM (next_due_at - now())) / 3600) AS h FROM tracked_page WHERE id = ${id}`)) as unknown as { h: string }[];
    return Number(r!.h);
  };
  const dailyPage = async (competitorId: string, url: string) =>
    (await dbs.service.insert(trackedPage)
      .values({ competitorId, url, pageType: 'home', source: 'nav', cadence: 'daily', nextDueAt: sql`now() - interval '1 minute'` })
      .returning({ id: trackedPage.id }))[0]!.id;

  it('a daily page tracked only by a reduced-trial agency advances 7 days; a page it shares with a normal agency stays daily', async () => {
    await reduce(IDS.agencyA); // A tracks X (shared with B) and Y (A only)
    const y = await dailyPage(IDS.competitorY, 'https://brightsmiles.example/');
    const x = await dailyPage(IDS.competitorX, 'https://smithhvac.example/');
    const claimed = await claimDuePages(dbs.service, 10);
    expect(claimed).toEqual(expect.arrayContaining([x, y]));
    expect(await hoursUntilDue(y)).toBe(168);
    expect(await hoursUntilDue(x)).toBe(24);
  });

  it('a shared page goes weekly once every tracking agency is reduced; leaving trialing restores daily', async () => {
    await reduce(IDS.agencyA);
    await reduce(IDS.agencyB);
    const x = await dailyPage(IDS.competitorX, 'https://smithhvac.example/');
    await claimDuePages(dbs.service, 10);
    expect(await hoursUntilDue(x)).toBe(168);
    await dbs.owner.update(agencyBilling).set({ state: 'active' }).where(eq(agencyBilling.agencyId, IDS.agencyB));
    await dbs.service.update(trackedPage).set({ nextDueAt: sql`now() - interval '1 minute'` }).where(eq(trackedPage.id, x));
    await claimDuePages(dbs.service, 10);
    expect(await hoursUntilDue(x)).toBe(24);
  });

  it('an invite-link trial keeps daily collection', async () => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing' });
    await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'invite' });
    const y = await dailyPage(IDS.competitorY, 'https://brightsmiles.example/');
    await claimDuePages(dbs.service, 10);
    expect(await hoursUntilDue(y)).toBe(24);
  });
});
